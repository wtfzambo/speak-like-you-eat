import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  type AssistantMessage,
  type Context,
  createAssistantMessageEventStream,
  registerApiProvider,
  unregisterApiProviders,
} from "@earendil-works/pi-ai/compat";
import {
  type AgentEndEvent,
  CONFIG_DIR_NAME,
  type ExtensionAPI,
  initTheme,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { writeConfigAtomically } from "../src/config.ts";
import type { ThinkingLevel } from "../src/model-completion.ts";
import speakLikeYouEatOmp from "../src/omp.ts";
import { PROMPT_FILENAME } from "../src/prompt.ts";

initTheme("dark", false);

type AgentMessage = AgentEndEvent["messages"][number];
type RuntimeHandler = (event: unknown, context: unknown) => unknown;
type RuntimeCommand = { handler: (args: string, context: unknown) => unknown };
type RuntimeRenderer = (message: { details?: unknown }, options: unknown, theme: unknown) => unknown;
type Notification = { message: string; type: "info" | "warning" | "error" | undefined };
type CustomComponent = { dispose?: () => void; handleInput?: (data: string) => void };
type SendOptions = { triggerTurn?: boolean; deliverAs?: "nextTurn" };
type SentMessage = {
  customType: string;
  content: string;
  display: boolean;
  details: unknown;
  attribution: string;
};
type NativeThinkingLevel = Exclude<ThinkingLevel, "off">;
type NativeThinking = {
  efforts: readonly NativeThinkingLevel[];
  requiresEffort?: boolean;
  suppressWhenOff?: boolean;
  effortRouting?: Partial<Record<NativeThinkingLevel, string>>;
};
type MockModel = {
  provider: string;
  id: string;
  name: string;
  api: string;
  baseUrl: string;
  reasoning: boolean;
  thinking?: NativeThinking;
  thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
  requestModelId?: string;
};
type ScopedModel = { model: MockModel; [key: string]: unknown };

const GLOBAL_SYSTEM_PROMPT = "Use the global OMP rewrite instructions.";
const PROJECT_SYSTEM_PROMPT = "Use the trusted OMP project rewrite instructions.";
const REPAIRED_PROJECT_SYSTEM_PROMPT = "Use the repaired OMP project rewrite instructions.";
const UPDATED_GLOBAL_SYSTEM_PROMPT = "Use the updated global OMP rewrite instructions.";

class OmpRuntime {
  readonly sentMessages: SentMessage[] = [];
  readonly sendOptions: SendOptions[] = [];
  continuationRequests = 0;
  isStreaming = false;
  #handlers = new Map<string, RuntimeHandler>();
  #commands = new Map<string, RuntimeCommand>();
  #renderers = new Map<string, RuntimeRenderer>();
  #sendFailure?: Error;
  #timers: Array<() => void> = [];

  on(event: string, handler: RuntimeHandler): void {
    this.#handlers.set(event, handler);
  }

  registerCommand(name: string, command: RuntimeCommand): void {
    this.#commands.set(name, command);
  }

  registerMessageRenderer(customType: string, renderer: RuntimeRenderer): void {
    this.#renderers.set(customType, renderer);
  }

  sendMessage(message: SentMessage, options: SendOptions = {}): void {
    if (this.isStreaming) {
      this.continuationRequests += 1;
      return;
    }
    if (this.#sendFailure !== undefined) {
      const failure = this.#sendFailure;
      this.#sendFailure = undefined;
      throw failure;
    }
    this.sentMessages.push(message);
    this.sendOptions.push(options);
  }

  failNextSend(failure: Error): void {
    this.#sendFailure = failure;
  }

  scheduleTimer(callback: () => void): void {
    this.#timers.push(callback);
  }

  startStreaming(): void {
    this.isStreaming = true;
  }

  finishStreaming(): void {
    this.isStreaming = false;
    while (this.#timers.length > 0) {
      this.#timers.shift()?.();
    }
  }

  get scheduledTimerCount(): number {
    return this.#timers.length;
  }

  handler(event: string): RuntimeHandler {
    const handler = this.#handlers.get(event);
    if (handler === undefined) {
      throw new Error(`OMP handler was not registered: ${event}`);
    }
    return handler;
  }

  command(name: string): RuntimeCommand {
    const command = this.#commands.get(name);
    if (command === undefined) {
      throw new Error(`OMP command was not registered: ${name}`);
    }
    return command;
  }

  renderer(customType: string): RuntimeRenderer {
    const renderer = this.#renderers.get(customType);
    if (renderer === undefined) {
      throw new Error(`OMP renderer was not registered: ${customType}`);
    }
    return renderer;
  }
}

class MockProvider {
  readonly contexts: Context[] = [];
  readonly models: unknown[] = [];
  readonly reasoning: Array<ThinkingLevel | undefined> = [];
  readonly signals: AbortSignal[] = [];
  calls = 0;
  #display: string;

  constructor(display = "Plain response.") {
    this.#display = display;
  }

  streamSimple(
    model: unknown,
    context: Context,
    options: { signal: AbortSignal; reasoning?: ThinkingLevel },
  ): { result: () => Promise<unknown> } {
    this.calls += 1;
    this.contexts.push(context);
    this.models.push(model);
    this.reasoning.push(options.reasoning);
    this.signals.push(options.signal);
    return {
      result: async () => response(this.#display),
    };
  }
}

class MockModelRegistry {
  readonly model: MockModel;
  readonly availableModels: MockModel[];
  #provider: MockProvider;

  constructor(provider: MockProvider, model = mockModel(), availableModels: MockModel[] = [model]) {
    this.#provider = provider;
    this.model = model;
    this.availableModels = availableModels;
  }

  find(provider: string, id: string): MockModel | undefined {
    return provider === this.model.provider && id === this.model.id ? this.model : undefined;
  }

  hasConfiguredAuth(model: unknown): boolean {
    return typeof model === "object" && model !== null && "provider" in model && model.provider === this.model.provider;
  }

  getAvailable(): MockModel[] {
    return this.availableModels;
  }

  async getApiKeyAndHeaders(): Promise<{ ok: true }> {
    return { ok: true };
  }

  getProvider(provider: string): MockProvider | undefined {
    return provider === this.model.provider ? this.#provider : undefined;
  }
}

class MockSessionManager {
  reads = 0;
  #branch: unknown[];

  constructor(branch: unknown[]) {
    this.#branch = branch;
  }

  getBranch(): unknown[] {
    this.reads += 1;
    return this.#branch;
  }
}

class MockUi {
  readonly notifications: Notification[] = [];
  readonly selectedScopes: Array<{ title: string; options: string[] }> = [];
  readonly workingMessages: Array<string | undefined> = [];
  #customInputs: string[][];
  #selectAnswers: Array<string | undefined>;

  constructor(options: { customInputs?: string[][]; selectAnswers?: Array<string | undefined> } = {}) {
    this.#customInputs = [...(options.customInputs ?? [])];
    this.#selectAnswers = [...(options.selectAnswers ?? [])];
  }

  notify(message: string, type?: Notification["type"]): void {
    this.notifications.push({ message, type });
  }

  setWorkingMessage(message?: string): void {
    this.workingMessages.push(message);
  }

  custom<T>(
    factory: (tui: unknown, theme: unknown, keybindings: unknown, done: (result: T) => void) => CustomComponent,
  ): Promise<T> {
    return new Promise<T>((resolve) => {
      let component: CustomComponent | undefined;
      const done = (result: T): void => {
        component?.dispose?.();
        resolve(result);
      };
      component = factory(
        { requestRender() {} },
        {
          fg(_color: string, value: string) {
            return value;
          },
          bg(_color: string, value: string) {
            return value;
          },
          bold(value: string) {
            return value;
          },
        },
        {
          matches(data: string, binding: string) {
            return (
              (binding === "tui.select.cancel" && data === "\u001b") ||
              (binding === "tui.select.confirm" && data === "\r") ||
              (binding === "tui.input.tab" && data === "\t") ||
              (binding === "tui.select.up" && data === "\u001b[A") ||
              (binding === "tui.select.down" && data === "\u001b[B")
            );
          },
        },
        done,
      );
      for (const input of this.#customInputs.shift() ?? []) {
        component.handleInput?.(input);
      }
    });
  }

  async select(title: string, options: string[]): Promise<string | undefined> {
    this.selectedScopes.push({ title, options: [...options] });
    return this.#selectAnswers.shift();
  }

  async confirm(): Promise<boolean> {
    return false;
  }
}

class BoundOmpContext {
  readonly cwd: string;
  readonly modelRegistry: MockModelRegistry;
  readonly sessionManager: MockSessionManager;
  readonly ui: MockUi;
  readonly scopedModels?: ScopedModel[];
  waitForIdleCalls = 0;
  #runtime?: OmpRuntime;
  #trusted: boolean;

  constructor(options: {
    cwd: string;
    modelRegistry: MockModelRegistry;
    sessionManager: MockSessionManager;
    runtime?: OmpRuntime;
    ui?: MockUi;
    scopedModels?: ScopedModel[];
    trusted?: boolean;
  }) {
    this.cwd = options.cwd;
    this.modelRegistry = options.modelRegistry;
    this.sessionManager = options.sessionManager;
    this.#runtime = options.runtime;
    this.ui = options.ui ?? new MockUi();
    this.scopedModels = options.scopedModels;
    this.#trusted = options.trusted ?? false;
  }

  async waitForIdle(): Promise<void> {
    this.waitForIdleCalls += 1;
  }

  isProjectTrusted(): boolean {
    return this.#trusted;
  }

  isIdle(): boolean {
    return this.#runtime?.isStreaming !== true;
  }

  setTimeout(callback: () => void): void {
    if (this.#runtime === undefined) {
      callback();
      return;
    }
    this.#runtime.scheduleTimer(callback);
  }
}

test("loads through the OMP entry point, translates rendering, and filters rewrite context", () => {
  const runtime = createExtension();
  const contextHandler = runtime.handler("context");

  assert.equal(typeof runtime.handler("session_start"), "function");
  assert.equal(typeof runtime.handler("agent_end"), "function");
  assert.equal(typeof runtime.command("slye").handler, "function");
  assert.deepEqual(
    contextHandler(
      {
        messages: [
          { role: "user", content: "hello" },
          { role: "custom", customType: "slye.rewrite", content: "" },
          { role: "custom", customType: "other", content: "keep" },
        ],
      },
      {},
    ),
    {
      messages: [
        { role: "user", content: "hello" },
        { role: "custom", customType: "other", content: "keep" },
      ],
    },
  );
  assert.equal(contextHandler({ messages: [{ role: "user", content: "hello" }] }, {}), undefined);
  assert.equal(contextHandler({ messages: "invalid" }, {}), undefined);

  const rendered = runtime.renderer("slye.rewrite")(
    { details: { display: "Saved Markdown", targetEntryId: "target", modelName: "Mock model" } },
    { expanded: false },
    renderTheme(),
  ) as { render(width: number): string[] } | undefined;
  const heading = rendered?.render(120)[1] ?? "";
  assert.equal(visibleWidth(heading), 120);
  assert.ok(heading.endsWith("Mock model "));
  assert.doesNotMatch(rendered?.render(30).join("\n") ?? "", /Mock model/);
  assert.match(rendered?.render(120).join("\n") ?? "", /Saved Markdown/);

  const compiledFallback = runtime.renderer("slye.rewrite")(
    { details: { display: "Compiled OMP card", targetEntryId: "target", modelName: "Mock model" } },
    { expanded: false },
    compiledOmpTheme(),
  ) as { render(width: number): string[] } | undefined;
  assert.match(compiledFallback?.render(120).join("\n") ?? "", /🤌 Speak like you eat:/);
  assert.match(compiledFallback?.render(120).join("\n") ?? "", /Mock model/);
  assert.match(compiledFallback?.render(120).join("\n") ?? "", /Compiled OMP card/);
});

test("applies missing OMP context fallbacks and preserves an existing non-TUI mode", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const provider = new MockProvider();
  const registry = new MockModelRegistry(provider);
  const sessionManager = new MockSessionManager([]);
  const ui = new MockUi({ customInputs: [["\r"]], selectAnswers: [undefined] });
  const fallbackContext = { cwd: directory, modelRegistry: registry, sessionManager, ui };
  const runtime = createExtension();

  await runtime.command("slye").handler("model", fallbackContext);

  assert.deepEqual(ui.selectedScopes, [
    { title: "Save SLYE model for", options: ["All projects", "This project only"] },
  ]);
  assert.equal(provider.calls, 0);

  const target = assistant("Short response.");
  const printContext = Object.assign(
    new BoundOmpContext({
      cwd: directory,
      modelRegistry: registry,
      sessionManager: new MockSessionManager([messageEntry("target", target)]),
    }),
    { mode: "print" as const },
  );
  await runtime.command("slye").handler("", printContext);
  assert.equal(printContext.waitForIdleCalls, 0);
  assert.equal(provider.calls, 0);
  assert.deepEqual(runtime.sentMessages, []);
});

test("manually rewrites through bound OMP services and persists a custom message", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const target = assistant("Short response.");
  const provider = new MockProvider("Plain manual response.");
  const registry = new MockModelRegistry(provider);
  const sessionManager = new MockSessionManager([
    messageEntry("user", user("please explain")),
    messageEntry("target", target),
  ]);
  const context = new BoundOmpContext({ cwd: directory, modelRegistry: registry, sessionManager });
  const runtime = createExtension();

  await runtime.command("slye").handler("", context);

  assert.equal(context.waitForIdleCalls, 1);
  assert.ok(sessionManager.reads > 0);
  assert.equal(provider.calls, 1);
  assert.strictEqual(provider.models[0], registry.model);
  assert.equal((provider.models[0] as { api: string }).api, "ollama-chat");
  assert.equal(
    provider.contexts[0]?.messages[0]?.content,
    "Target:\nShort response.\n\nRewrite the target above. Return only its rewritten text; do not answer it.",
  );
  assert.deepEqual(runtime.sentMessages, [rewriteMessage("Plain manual response.", "target")]);
  assert.deepEqual(runtime.sendOptions, [{ triggerTurn: false, deliverAs: "nextTurn" }]);
});

test("maps mandatory native thinking to canonical requests and all-model picker labels", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const provider = new MockProvider();
  const model = mockModel({
    reasoning: true,
    thinking: { efforts: ["high"], requiresEffort: true },
  });
  const registry = new MockModelRegistry(provider, model);
  const ui = new MockUi({ customInputs: [["\r"]], selectAnswers: ["All projects"] });
  const context = new BoundOmpContext({
    cwd: directory,
    modelRegistry: registry,
    sessionManager: new MockSessionManager([messageEntry("target", assistant("Short response."))]),
    ui,
  });
  const runtime = createExtension();

  await runtime.command("slye").handler("model", context);
  await runtime.command("slye").handler("", context);

  assert.deepEqual(ui.notifications, [
    { message: "SLYE manual rewrites configured with test / model · thinking: high for All projects.", type: "info" },
  ]);
  assert.deepEqual(provider.reasoning, ["high"]);
  assert.notStrictEqual(provider.models[0], registry.model);
  assert.deepEqual((provider.models[0] as MockModel).thinking, model.thinking);
  assert.deepEqual((provider.models[0] as MockModel).thinkingLevelMap, {
    off: null,
    minimal: null,
    low: null,
    medium: null,
    high: "high",
    xhigh: null,
    max: null,
  });
  assert.equal(registry.model.thinkingLevelMap, undefined);
});

test("uses the canonical native minimum instead of the default-routed effort", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const provider = new MockProvider();
  const model = mockModel({
    reasoning: true,
    requestModelId: "high-route",
    thinking: {
      efforts: ["high", "low"],
      requiresEffort: true,
      effortRouting: { low: "low-route", high: "high-route" },
    },
  });
  const registry = new MockModelRegistry(provider, model);
  const context = new BoundOmpContext({
    cwd: directory,
    modelRegistry: registry,
    sessionManager: new MockSessionManager([messageEntry("target", assistant("Short response."))]),
  });
  const runtime = createExtension();

  await runtime.command("slye").handler("", context);

  assert.deepEqual(provider.reasoning, ["low"]);
  assert.equal((provider.models[0] as MockModel).requestModelId, "high-route");
});

test("keeps optional native thinking off", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const provider = new MockProvider();
  const registry = new MockModelRegistry(provider, mockModel({ reasoning: true, thinking: { efforts: ["low"] } }));
  const context = new BoundOmpContext({
    cwd: directory,
    modelRegistry: registry,
    sessionManager: new MockSessionManager([messageEntry("target", assistant("Short response."))]),
  });
  const runtime = createExtension();

  await runtime.command("slye").handler("", context);

  assert.deepEqual(provider.reasoning, [undefined]);
});

test("keeps suppressible mandatory native thinking off", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const provider = new MockProvider();
  const registry = new MockModelRegistry(
    provider,
    mockModel({
      reasoning: true,
      thinking: { efforts: ["high"], requiresEffort: true, suppressWhenOff: true },
    }),
  );
  const context = new BoundOmpContext({
    cwd: directory,
    modelRegistry: registry,
    sessionManager: new MockSessionManager([messageEntry("target", assistant("Short response."))]),
  });
  const runtime = createExtension();

  await runtime.command("slye").handler("", context);

  assert.deepEqual(provider.reasoning, [undefined]);
});

test("keeps legacy Pi thinking models unchanged", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const provider = new MockProvider();
  const model = mockModel({
    reasoning: true,
    thinkingLevelMap: { off: null, minimal: null, low: null, medium: null, high: "high", xhigh: null, max: null },
  });
  const registry = new MockModelRegistry(provider, model);
  const context = new BoundOmpContext({
    cwd: directory,
    modelRegistry: registry,
    sessionManager: new MockSessionManager([messageEntry("target", assistant("Short response."))]),
  });
  const runtime = createExtension();

  await runtime.command("slye").handler("", context);

  assert.deepEqual(provider.reasoning, ["high"]);
  assert.strictEqual(provider.models[0], registry.model);
  assert.strictEqual(registry.model.thinkingLevelMap, model.thinkingLevelMap);
});

test("normalizes native thinking in scoped model discovery", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const provider = new MockProvider();
  const model = mockModel({ reasoning: true, thinking: { efforts: ["high"], requiresEffort: true } });
  const registry = new MockModelRegistry(provider, model, []);
  const ui = new MockUi({ customInputs: [["\r"]], selectAnswers: ["All projects"] });
  const context = new BoundOmpContext({
    cwd: directory,
    modelRegistry: registry,
    sessionManager: new MockSessionManager([]),
    scopedModels: [{ model, source: "test" }],
    ui,
  });
  const runtime = createExtension();

  await runtime.command("slye").handler("model", context);

  assert.deepEqual(ui.notifications, [
    { message: "SLYE manual rewrites configured with test / model · thinking: high for All projects.", type: "info" },
  ]);
});

test("does not expose a malformed mandatory native thinking model", async (t) => {
  const directory = await setupConfiguredDirectory(t, true);
  const provider = new MockProvider();
  const registry = new MockModelRegistry(
    provider,
    mockModel({ reasoning: true, thinking: { efforts: [], requiresEffort: true } }),
  );
  const context = new BoundOmpContext({
    cwd: directory,
    modelRegistry: registry,
    sessionManager: new MockSessionManager([]),
  });
  const runtime = createExtension();

  await runtime.handler("session_start")({}, context);

  assert.equal(provider.calls, 0);
  assert.deepEqual(context.ui.notifications, [
    { message: "SLYE's selected model is unavailable. Run /slye model.", type: "warning" },
  ]);
});

test("uses a trusted OMP project prompt before the global prompt", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const prompts = promptPaths(directory);
  const target = assistant("Short response.");
  const provider = new MockProvider("Project prompt response.");
  const registry = new MockModelRegistry(provider);
  const context = new BoundOmpContext({
    cwd: directory,
    modelRegistry: registry,
    sessionManager: new MockSessionManager([messageEntry("target", target)]),
    trusted: true,
  });
  const runtime = createExtension();

  await writePrompt(prompts.global, GLOBAL_SYSTEM_PROMPT);
  await writePrompt(prompts.project, PROJECT_SYSTEM_PROMPT);
  await runtime.command("slye").handler("", context);

  assert.equal(provider.calls, 1);
  assert.deepEqual(
    provider.contexts.map((request) => request.systemPrompt),
    [PROJECT_SYSTEM_PROMPT],
  );
  assert.deepEqual(runtime.sentMessages, [rewriteMessage("Project prompt response.", "target")]);
});

test("uses the global prompt for an explicitly untrusted OMP project", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const prompts = promptPaths(directory);
  const target = assistant("Short response.");
  const provider = new MockProvider("Global prompt response.");
  const registry = new MockModelRegistry(provider);
  const context = new BoundOmpContext({
    cwd: directory,
    modelRegistry: registry,
    sessionManager: new MockSessionManager([messageEntry("target", target)]),
    trusted: false,
  });
  const runtime = createExtension();

  await writePrompt(prompts.global, GLOBAL_SYSTEM_PROMPT);
  await writePrompt(prompts.project, PROJECT_SYSTEM_PROMPT);
  await runtime.command("slye").handler("", context);

  assert.equal(provider.calls, 1);
  assert.deepEqual(
    provider.contexts.map((request) => request.systemPrompt),
    [GLOBAL_SYSTEM_PROMPT],
  );
  assert.deepEqual(runtime.sentMessages, [rewriteMessage("Global prompt response.", "target")]);
});

test("uses the global prompt when the OMP project has no prompt", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const prompts = promptPaths(directory);
  const target = assistant("Short response.");
  const provider = new MockProvider("Global prompt response.");
  const registry = new MockModelRegistry(provider);
  const context = new BoundOmpContext({
    cwd: directory,
    modelRegistry: registry,
    sessionManager: new MockSessionManager([messageEntry("target", target)]),
    trusted: true,
  });
  const runtime = createExtension();

  await writePrompt(prompts.global, GLOBAL_SYSTEM_PROMPT);
  await runtime.command("slye").handler("", context);

  assert.equal(provider.calls, 1);
  assert.deepEqual(
    provider.contexts.map((request) => request.systemPrompt),
    [GLOBAL_SYSTEM_PROMPT],
  );
  assert.deepEqual(runtime.sentMessages, [rewriteMessage("Global prompt response.", "target")]);
});

test("blocks a blank trusted OMP project prompt and retries the repaired target manually", async (t) => {
  const directory = await setupConfiguredDirectory(t, true);
  const prompts = promptPaths(directory);
  const target = assistant("complete response ".repeat(20));
  const provider = new MockProvider("Repaired prompt response.");
  const registry = new MockModelRegistry(provider);
  const sessionManager = new MockSessionManager([
    messageEntry("user", user("please explain")),
    messageEntry("target", target),
  ]);
  const context = new BoundOmpContext({
    cwd: directory,
    modelRegistry: registry,
    sessionManager,
    trusted: true,
  });
  const runtime = createExtension();
  const event = { type: "agent_end", messages: [target] } as AgentEndEvent;

  await writePrompt(prompts.global, GLOBAL_SYSTEM_PROMPT);
  await writePrompt(prompts.project, " \n");
  await runtime.handler("agent_end")(event, context);

  assert.equal(provider.calls, 0);
  assert.deepEqual(runtime.sentMessages, []);
  assert.deepEqual(context.ui.notifications, [
    {
      message: `SLYE system prompt is invalid at ${prompts.project}. Fix or remove it.`,
      type: "warning",
    },
  ]);

  await writePrompt(prompts.project, REPAIRED_PROJECT_SYSTEM_PROMPT);
  await runtime.command("slye").handler("", context);

  assert.equal(provider.calls, 1);
  assert.deepEqual(
    provider.contexts.map((request) => request.systemPrompt),
    [REPAIRED_PROJECT_SYSTEM_PROMPT],
  );
  assert.deepEqual(runtime.sentMessages, [rewriteMessage("Repaired prompt response.", "target")]);
});

test("reloads the OMP global prompt for fresh manual targets", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const prompts = promptPaths(directory);
  const firstTarget = assistant("First response.");
  const secondTarget = assistant("Second response.");
  const branch = [messageEntry("first-target", firstTarget)];
  const provider = new MockProvider("Fresh prompt response.");
  const registry = new MockModelRegistry(provider);
  const context = new BoundOmpContext({
    cwd: directory,
    modelRegistry: registry,
    sessionManager: new MockSessionManager(branch),
  });
  const runtime = createExtension();

  await writePrompt(prompts.global, GLOBAL_SYSTEM_PROMPT);
  await runtime.command("slye").handler("", context);
  await writePrompt(prompts.global, UPDATED_GLOBAL_SYSTEM_PROMPT);
  branch.push(messageEntry("second-target", secondTarget));
  await runtime.command("slye").handler("", context);

  assert.equal(provider.calls, 2);
  assert.deepEqual(
    provider.contexts.map((request) => request.systemPrompt),
    [GLOBAL_SYSTEM_PROMPT, UPDATED_GLOBAL_SYSTEM_PROMPT],
  );
  assert.deepEqual(runtime.sentMessages, [
    rewriteMessage("Fresh prompt response.", "first-target"),
    rewriteMessage("Fresh prompt response.", "second-target"),
  ]);
});

test("manually rewrites through the compat fallback when OMP omits getProvider", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const target = assistant("Short response.");
  const sourceId = "slye-omp-compat-fallback-test";
  let streamedModel: unknown;
  t.after(() => unregisterApiProviders(sourceId));
  registerApiProvider(
    {
      api: "ollama-chat",
      stream() {
        throw new Error("The fallback must use streamSimple.");
      },
      streamSimple(model) {
        streamedModel = model;
        const stream = createAssistantMessageEventStream();
        stream.end(response("Plain fallback response.") as AssistantMessage);
        return stream;
      },
    },
    sourceId,
  );

  const providerBackedRegistry = new MockModelRegistry(new MockProvider());
  const registry = {
    find: providerBackedRegistry.find.bind(providerBackedRegistry),
    hasConfiguredAuth: providerBackedRegistry.hasConfiguredAuth.bind(providerBackedRegistry),
    getAvailable: providerBackedRegistry.getAvailable.bind(providerBackedRegistry),
    getApiKeyAndHeaders: providerBackedRegistry.getApiKeyAndHeaders.bind(providerBackedRegistry),
  };
  const runtime = createExtension();
  const context = {
    cwd: directory,
    modelRegistry: registry,
    sessionManager: new MockSessionManager([
      messageEntry("user", user("please explain")),
      messageEntry("target", target),
    ]),
    ui: new MockUi(),
    waitForIdle: async () => {},
    isProjectTrusted: () => false,
    isIdle: () => true,
    setTimeout() {
      throw new Error("An idle manual rewrite must not schedule delivery.");
    },
  };

  assert.equal("getProvider" in registry, false);
  await runtime.command("slye").handler("", context);

  assert.equal((streamedModel as { api: string }).api, "ollama-chat");
  assert.deepEqual(runtime.sentMessages, [rewriteMessage("Plain fallback response.", "target")]);
});

test("automatically rewrites once with a missing OMP signal", async (t) => {
  const directory = await setupConfiguredDirectory(t, true);
  const target = assistant("complete response ".repeat(20));
  const provider = new MockProvider("Plain automatic response.");
  const registry = new MockModelRegistry(provider);
  const sessionManager = new MockSessionManager([
    messageEntry("user", user("please explain")),
    messageEntry("target", target),
  ]);
  const runtime = createExtension();
  const context = new BoundOmpContext({ cwd: directory, modelRegistry: registry, sessionManager, runtime });
  const event = { type: "agent_end", messages: [target] } as AgentEndEvent;

  runtime.startStreaming();
  await runtime.handler("agent_end")(event, context);
  await runtime.handler("agent_end")(event, context);

  assert.equal(provider.calls, 1);
  assert.equal(provider.signals.length, 1);
  assert.ok(provider.signals[0] instanceof AbortSignal);
  assert.deepEqual(context.ui.workingMessages, ["Rewriting AI-speak…"]);
  assert.equal(runtime.continuationRequests, 0);
  assert.equal(runtime.scheduledTimerCount, 1);
  assert.deepEqual(runtime.sentMessages, []);

  runtime.finishStreaming();
  await settleBackgroundWork();

  assert.deepEqual(context.ui.workingMessages, ["Rewriting AI-speak…", undefined]);
  assert.deepEqual(runtime.sentMessages, [rewriteMessage("Plain automatic response.", "target")]);
  assert.deepEqual(runtime.sendOptions, [{ triggerTurn: false, deliverAs: "nextTurn" }]);
});

test("warns on a synchronous OMP send rejection and leaves the target manually retryable", async (t) => {
  const directory = await setupConfiguredDirectory(t, true);
  const target = assistant("complete response ".repeat(20));
  const provider = new MockProvider("Plain retryable response.");
  const registry = new MockModelRegistry(provider);
  const sessionManager = new MockSessionManager([
    messageEntry("user", user("please explain")),
    messageEntry("target", target),
  ]);
  const runtime = createExtension();
  const context = new BoundOmpContext({ cwd: directory, modelRegistry: registry, sessionManager, runtime });
  const event = { type: "agent_end", messages: [target] } as AgentEndEvent;

  runtime.failNextSend(new Error("OMP persistence failed"));
  runtime.startStreaming();
  await runtime.handler("agent_end")(event, context);
  runtime.finishStreaming();
  await settleBackgroundWork();

  assert.equal(provider.calls, 1);
  assert.deepEqual(runtime.sentMessages, []);
  assert.deepEqual(context.ui.notifications, [{ message: "SLYE could not create a rewrite.", type: "warning" }]);

  await runtime.command("slye").handler("", context);

  assert.equal(provider.calls, 2);
  assert.deepEqual(runtime.sentMessages, [rewriteMessage("Plain retryable response.", "target")]);
  assert.deepEqual(runtime.sendOptions, [{ triggerTurn: false, deliverAs: "nextTurn" }]);
  assert.deepEqual(context.ui.notifications, [{ message: "SLYE could not create a rewrite.", type: "warning" }]);
});

test("suppresses a repeated manual rewrite after OMP persistence", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const target = assistant("Short response.");
  const provider = new MockProvider();
  const registry = new MockModelRegistry(provider);
  const context = new BoundOmpContext({
    cwd: directory,
    modelRegistry: registry,
    sessionManager: new MockSessionManager([messageEntry("target", target)]),
  });
  const runtime = createExtension();

  await runtime.command("slye").handler("", context);
  await runtime.command("slye").handler("", context);

  assert.equal(provider.calls, 1);
  assert.equal(runtime.sentMessages.length, 1);
  assert.deepEqual(context.ui.notifications, [
    { message: "The latest response already has a SLYE rewrite.", type: "info" },
  ]);
});

test("normalizes a persisted OMP rewrite after resume before duplicate detection", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const target = assistant("Short response.");
  const provider = new MockProvider();
  const registry = new MockModelRegistry(provider);
  const context = new BoundOmpContext({
    cwd: directory,
    modelRegistry: registry,
    sessionManager: new MockSessionManager([
      messageEntry("target", target),
      {
        type: "custom_message",
        id: "rewrite",
        customType: "slye.rewrite",
        content: "",
        display: true,
        details: { display: "Saved response.", targetEntryId: "target", modelName: "Old model" },
      },
    ]),
  });
  const resumedRuntime = createExtension();
  const rendered = resumedRuntime.renderer("slye.rewrite")(
    { details: { display: "Saved response.", targetEntryId: "target", modelName: "Old model" } },
    { expanded: false },
    renderTheme(),
  ) as { render(width: number): string[] } | undefined;
  assert.match(rendered?.render(120)[1] ?? "", /Old model\s*$/);

  await resumedRuntime.command("slye").handler("", context);

  assert.equal(provider.calls, 0);
  assert.deepEqual(resumedRuntime.sentMessages, []);
  assert.deepEqual(context.ui.notifications, [
    { message: "The latest response already has a SLYE rewrite.", type: "info" },
  ]);
});

function createExtension(): OmpRuntime {
  const runtime = new OmpRuntime();
  speakLikeYouEatOmp(runtime as unknown as ExtensionAPI);
  return runtime;
}

function mockModel(overrides: Partial<MockModel> = {}): MockModel {
  return {
    provider: "test",
    id: "model",
    name: "Mock model",
    api: "ollama-chat",
    baseUrl: "https://model.example.test",
    reasoning: false,
    ...overrides,
  };
}

async function setupConfiguredDirectory(t: test.TestContext, enabled: boolean): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "slye-omp-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = join(directory, "agent");
  t.after(() => restoreEnvironment("PI_CODING_AGENT_DIR", previousAgentDir));
  await writeConfigAtomically(join(directory, "agent", "slye.json"), {
    enabled,
    model: { provider: "test", id: "model" },
  });
  return join(directory, "project");
}

function promptPaths(directory: string): { global: string; project: string } {
  const agentDirectory = process.env.PI_CODING_AGENT_DIR;
  if (agentDirectory === undefined) {
    throw new Error("Test agent directory is not configured.");
  }

  return {
    global: join(agentDirectory, PROMPT_FILENAME),
    project: join(directory, CONFIG_DIR_NAME, PROMPT_FILENAME),
  };
}

async function writePrompt(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}

function messageEntry(id: string, message: AgentMessage): SessionEntry {
  return { type: "message", id, parentId: null, timestamp: "now", message } as SessionEntry;
}

function assistant(value: string): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: value }],
    stopReason: "stop",
    timestamp: 2,
  } as AgentMessage;
}

function user(value: string): AgentMessage {
  return { role: "user", content: value, timestamp: 1 } as AgentMessage;
}

function response(value: string): unknown {
  return { stopReason: "stop", content: [{ type: "text", text: value }] };
}

function rewriteMessage(display: string, targetEntryId: string): SentMessage {
  return {
    customType: "slye.rewrite",
    content: "",
    display: true,
    details: { display, targetEntryId, modelName: "Mock model" },
    attribution: "agent",
  };
}

function renderTheme(): unknown {
  return {
    bg(_name: string, text: string) {
      return text;
    },
    bold(text: string) {
      return text;
    },
    fg(_name: string, text: string) {
      return text;
    },
  };
}

function compiledOmpTheme(): unknown {
  let firstBoldCall = true;
  return {
    bg(_name: string, text: string) {
      return text;
    },
    bold(text: string) {
      if (firstBoldCall) {
        firstBoldCall = false;
        throw new TypeError("undefined is not an object (evaluating 'theme.getColorMode')");
      }
      return text;
    },
    fg(_name: string, text: string) {
      return text;
    },
  };
}

async function settleBackgroundWork(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
