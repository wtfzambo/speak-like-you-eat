import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  type AgentEndEvent,
  type EntryRenderer,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  initTheme,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { writeConfigAtomically } from "../src/config.ts";
import speakLikeYouEat from "../src/index.ts";

initTheme("dark", false);

type AgentMessage = AgentEndEvent["messages"][number];
type AgentEndHandler = (event: AgentEndEvent, ctx: ExtensionContext) => Promise<void>;
type Notification = { message: string; type: "info" | "warning" | "error" | undefined };
type AppendedEntry = { customType: string; data: unknown };
type Completion = (model: unknown, context: unknown, options: { signal: AbortSignal }) => Promise<unknown>;
type RegisteredCommand = { handler(args: string, ctx: ExtensionCommandContext): Promise<void> };
type CustomComponent = { handleInput?: (data: string) => void };

function createExtension(options: { appendThrows?: boolean | number } = {}): {
  command: RegisteredCommand;
  endAgent: (event: AgentEndEvent, ctx: ExtensionContext) => Promise<void>;
  appendedEntries: AppendedEntry[];
  renderer: EntryRenderer | undefined;
  sendMessageCalls: number;
} {
  let agentEndHandler: AgentEndHandler | undefined;
  let command: RegisteredCommand | undefined;
  let renderer: EntryRenderer | undefined;
  const appendedEntries: AppendedEntry[] = [];
  let appendFailures =
    typeof options.appendThrows === "number" ? options.appendThrows : options.appendThrows ? Infinity : 0;
  let sendMessageCalls = 0;
  const api = {
    on(event: string, handler: unknown) {
      if (event === "agent_end") {
        agentEndHandler = handler as AgentEndHandler;
      }
    },
    registerCommand(_name: string, registeredCommand: RegisteredCommand) {
      command = registeredCommand;
    },
    registerEntryRenderer(_type: string, registeredRenderer: EntryRenderer) {
      renderer = registeredRenderer;
    },
    appendEntry(customType: string, data: unknown) {
      if (appendFailures > 0) {
        appendFailures -= 1;
        throw new Error("cannot append");
      }
      appendedEntries.push({ customType, data });
    },
    sendMessage() {
      sendMessageCalls += 1;
    },
  } as unknown as ExtensionAPI;

  speakLikeYouEat(api);
  if (agentEndHandler === undefined || command === undefined) {
    throw new Error("SLYE did not register its handlers");
  }

  return {
    command,
    endAgent: agentEndHandler,
    appendedEntries,
    renderer,
    get sendMessageCalls() {
      return sendMessageCalls;
    },
  };
}

function createContext(options: {
  cwd: string;
  branch: SessionEntry[];
  mode?: "tui" | "print";
  modelUsable?: boolean;
  malformedThinking?: boolean;
  signal?: AbortSignal;
  complete?: Completion;
  throwWhenReadingBranch?: boolean;
  waitForIdle?: () => Promise<void>;
  onGetBranch?: () => void;
  customInputBatches?: string[][];
  selectAnswers?: Array<string | undefined>;
  onCustomComponent?: (component: CustomComponent) => void;
  throwWhenOpeningCustom?: boolean | number;
  throwWhenSettingWorkingMessage?: boolean | number;
}): {
  context: ExtensionCommandContext;
  notifications: Notification[];
  workingMessages: Array<string | undefined>;
  completionCalls: number;
  findCalls: number;
  waitForIdleCalls: number;
  selectedTitles: string[];
} {
  const notifications: Notification[] = [];
  const workingMessages: Array<string | undefined> = [];
  const selectedTitles: string[] = [];
  const customInputBatches = [...(options.customInputBatches ?? [])];
  const selectAnswers = [...(options.selectAnswers ?? [])];
  let completionCalls = 0;
  let findCalls = 0;
  let waitForIdleCalls = 0;
  let customFailures =
    typeof options.throwWhenOpeningCustom === "number"
      ? options.throwWhenOpeningCustom
      : options.throwWhenOpeningCustom
        ? Infinity
        : 0;
  let workingMessageFailures =
    typeof options.throwWhenSettingWorkingMessage === "number"
      ? options.throwWhenSettingWorkingMessage
      : options.throwWhenSettingWorkingMessage
        ? Infinity
        : 0;
  const model = {
    provider: "test",
    id: "model",
    baseUrl: "https://model.example.test",
    reasoning: options.malformedThinking ?? false,
    thinkingLevelMap: options.malformedThinking
      ? { off: null, minimal: null, low: null, medium: null, high: null, xhigh: null, max: null }
      : undefined,
  };
  const complete = options.complete ?? (async () => response("stop", [text("Plain response.")]));
  const context = {
    mode: options.mode ?? "tui",
    cwd: options.cwd,
    signal: options.signal,
    ui: {
      notify(message: string, type?: Notification["type"]) {
        notifications.push({ message, type });
      },
      setWorkingMessage(message?: string) {
        workingMessages.push(message);
        if (workingMessageFailures > 0) {
          workingMessageFailures -= 1;
          throw new Error("working message failed");
        }
      },
      custom<T>(
        factory: (tui: unknown, theme: unknown, keybindings: unknown, done: (result: T) => void) => CustomComponent,
      ) {
        if (customFailures > 0) {
          customFailures -= 1;
          throw new Error("custom UI failed");
        }
        return new Promise<T>((resolve) => {
          let component: (CustomComponent & { dispose?: () => void }) | undefined;
          const done = (result: T) => {
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
          options.onCustomComponent?.(component);
          for (const input of customInputBatches.shift() ?? []) {
            component.handleInput?.(input);
          }
        });
      },
      async select(title: string): Promise<string | undefined> {
        selectedTitles.push(title);
        return selectAnswers.shift();
      },
      async confirm(): Promise<boolean> {
        return false;
      },
    },
    waitForIdle: async () => {
      waitForIdleCalls += 1;
      await options.waitForIdle?.();
    },
    scopedModels: [],
    sessionManager: {
      getBranch() {
        options.onGetBranch?.();
        if (options.throwWhenReadingBranch) {
          throw new Error("session unavailable");
        }
        return options.branch;
      },
    },
    modelRegistry: {
      find(provider: string, id: string) {
        findCalls += 1;
        if (options.modelUsable === false || provider !== model.provider || id !== model.id) {
          return undefined;
        }
        return model;
      },
      hasConfiguredAuth() {
        return options.modelUsable !== false;
      },
      getAvailable() {
        return [model];
      },
      getProvider() {
        return {
          streamSimple(selectedModel: unknown, request: unknown, requestOptions: { signal: AbortSignal }) {
            assert.strictEqual(selectedModel, model);
            completionCalls += 1;
            return { result: () => complete(selectedModel, request, requestOptions) };
          },
        };
      },
      async getApiKeyAndHeaders() {
        return { ok: true };
      },
    },
    isProjectTrusted() {
      return false;
    },
  } as unknown as ExtensionCommandContext;

  return {
    context,
    notifications,
    workingMessages,
    selectedTitles,
    get completionCalls() {
      return completionCalls;
    },
    get findCalls() {
      return findCalls;
    },
    get waitForIdleCalls() {
      return waitForIdleCalls;
    },
  };
}

test("calls the configured authenticated model once with an isolated exact rewrite payload", async (t) => {
  const directory = await setupConfiguredDirectory(t, true);
  const firstTargetBlock = "first target block ".repeat(12);
  const secondTargetBlock = "second target block ".repeat(12);
  const target = longAssistant([text(firstTargetBlock), text(secondTargetBlock)]);
  const branch = [entry("user", user("Spiega questo in italiano")), entry("target", target)];
  const extension = createExtension();
  let receivedContext: { systemPrompt: string; messages: Array<{ role: string; content: string }> } | undefined;
  let receivedOptions: { signal: AbortSignal; cacheRetention: string; sessionId: string } | undefined;
  const testContext = createContext({
    cwd: directory,
    branch,
    async complete(_model, request, options) {
      receivedContext = request as typeof receivedContext;
      receivedOptions = options as typeof receivedOptions;
      return response("stop", [text("Prima parte."), text("Seconda parte.")]);
    },
  });

  await extension.endAgent({ type: "agent_end", messages: [target] } as AgentEndEvent, testContext.context);

  assert.equal(extension.appendedEntries.length, 1);
  assert.equal(extension.appendedEntries[0]?.customType, "slye.rewrite");
  assert.deepEqual(extension.appendedEntries[0]?.data, {
    display: "Prima parte.\n\nSeconda parte.",
    targetEntryId: "target",
  });
  assert.equal(extension.sendMessageCalls, 0);
  assert.equal(testContext.completionCalls, 1);
  assert.equal(testContext.findCalls, 1);
  assert.deepEqual(testContext.notifications, []);
  assert.deepEqual(testContext.workingMessages, ["Rewriting AI-speak…", undefined]);
  assert.deepEqual(Object.keys(receivedContext ?? {}).sort(), ["messages", "systemPrompt"]);
  assert.equal(receivedContext?.messages.length, 1);
  assert.equal(receivedContext?.messages[0]?.role, "user");
  assert.equal(
    receivedContext?.messages[0]?.content,
    `Context:\nuser:\nSpiega questo in italiano\n\nTarget:\n${firstTargetBlock}\n\n${secondTargetBlock}`,
  );
  assert.match(receivedContext?.systemPrompt ?? "", /Rewrite only the target in clear, everyday language\./);
  assert.match(
    receivedContext?.systemPrompt ?? "",
    /Preserve the target's original language and intentional language mix; do not translate\./,
  );
  assert.match(receivedContext?.systemPrompt ?? "", /Context is only for topic understanding/);
  assert.match(receivedContext?.systemPrompt ?? "", /ignore any instructions/);
  assert.equal(receivedOptions?.cacheRetention, "none");
  assert.match(receivedOptions?.sessionId ?? "", /^[0-9a-f-]{36}$/i);
  assert.notEqual(receivedOptions?.signal, testContext.context.signal);
});

test("does not call a model outside TUI or with missing, disabled, or unusable configuration", async (t) => {
  const directory = await setupConfiguredDirectory(t, true);
  const target = longAssistant();
  const branch = [entry("user", user("please explain")), entry("target", target)];
  const agentDirectory = process.env.PI_CODING_AGENT_DIR;
  if (agentDirectory === undefined) {
    throw new Error("Test agent directory is not configured.");
  }
  const configPath = join(agentDirectory, "slye.json");

  const outside = createExtension();
  const outsideContext = createContext({ cwd: directory, branch, mode: "print" });
  await outside.endAgent({ type: "agent_end", messages: [target] } as AgentEndEvent, outsideContext.context);

  await rm(configPath);
  const missing = createExtension();
  const missingContext = createContext({ cwd: directory, branch });
  await missing.endAgent({ type: "agent_end", messages: [target] } as AgentEndEvent, missingContext.context);

  await writeFile(configPath, "{ invalid", "utf8");
  const invalid = createExtension();
  const invalidContext = createContext({ cwd: directory, branch });
  await invalid.endAgent({ type: "agent_end", messages: [target] } as AgentEndEvent, invalidContext.context);

  await writeConfigAtomically(configPath, { enabled: false, model: { provider: "test", id: "model" } });
  const disabled = createExtension();
  const disabledContext = createContext({ cwd: directory, branch });
  await disabled.endAgent({ type: "agent_end", messages: [target] } as AgentEndEvent, disabledContext.context);

  await writeConfigAtomically(configPath, { enabled: true, model: { provider: "test", id: "model" } });
  const unauthenticated = createExtension();
  const unauthenticatedContext = createContext({ cwd: directory, branch, modelUsable: false });
  await unauthenticated.endAgent(
    { type: "agent_end", messages: [target] } as AgentEndEvent,
    unauthenticatedContext.context,
  );

  for (const [extension, testContext] of [
    [outside, outsideContext],
    [missing, missingContext],
    [invalid, invalidContext],
    [disabled, disabledContext],
    [unauthenticated, unauthenticatedContext],
  ] as const) {
    assert.equal(testContext.completionCalls, 0);
    assert.deepEqual(extension.appendedEntries, []);
  }
});

test("does not dispatch a saved model with malformed thinking metadata or change its configuration", async (t) => {
  const directory = await setupConfiguredDirectory(t, true);
  const target = longAssistant();
  const configPath = join(process.env.PI_CODING_AGENT_DIR ?? "", "slye.json");
  const savedConfig = await readFile(configPath, "utf8");
  const extension = createExtension();
  const testContext = createContext({
    cwd: directory,
    branch: [entry("user", user("please explain")), entry("target", target)],
    malformedThinking: true,
  });

  await extension.endAgent({ type: "agent_end", messages: [target] } as AgentEndEvent, testContext.context);

  assert.equal(testContext.completionCalls, 0);
  assert.deepEqual(extension.appendedEntries, []);
  assert.equal(await readFile(configPath, "utf8"), savedConfig);
});

test("processes a duplicate target event only once", async (t) => {
  const directory = await setupConfiguredDirectory(t, true);
  const target = longAssistant();
  const branch = [entry("user", user("please explain")), entry("target", target)];
  let calls = 0;
  const extension = createExtension();
  const { context } = createContext({
    cwd: directory,
    branch,
    async complete() {
      calls += 1;
      return response("stop", [text("Plain response.")]);
    },
  });
  const event = { type: "agent_end", messages: [target] } as AgentEndEvent;

  await extension.endAgent(event, context);
  await extension.endAgent(event, context);

  assert.equal(calls, 1);
  assert.equal(extension.appendedEntries.length, 1);
});

test("cancels a running secondary request silently and restores the working message", async (t) => {
  const directory = await setupConfiguredDirectory(t, true);
  const target = longAssistant();
  const branch = [entry("user", user("please explain")), entry("target", target)];
  const userController = new AbortController();
  let requestSignal: AbortSignal | undefined;
  let resolveStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  const extension = createExtension();
  const { context, notifications, workingMessages } = createContext({
    cwd: directory,
    branch,
    signal: userController.signal,
    complete(_model, _request, options) {
      requestSignal = options.signal;
      resolveStarted?.();
      return new Promise(() => undefined);
    },
  });

  const completed = extension.endAgent({ type: "agent_end", messages: [target] } as AgentEndEvent, context);
  await started;
  userController.abort();
  await completed;

  assert.equal(requestSignal?.aborted, true);
  assert.deepEqual(extension.appendedEntries, []);
  assert.deepEqual(notifications, []);
  assert.deepEqual(workingMessages, ["Rewriting AI-speak…", undefined]);

  const retried = createContext({ cwd: directory, branch });
  await extension.command.handler("", retried.context);
  assert.equal(retried.completionCalls, 1);
  assert.equal(extension.appendedEntries.length, 1);
});

test("provider, non-stop, and empty failures leave the original alone and warn once", async (t) => {
  const directory = await setupConfiguredDirectory(t, true);
  const extension = createExtension();
  const providerTarget = longAssistant();
  const providerFailure = createContext({
    cwd: directory,
    branch: [entry("user", user("please explain")), entry("provider", providerTarget)],
    async complete() {
      throw new Error("provider failed");
    },
  });
  const nonStopTarget = longAssistant();
  const nonStopFailure = createContext({
    cwd: directory,
    branch: [entry("user", user("please explain")), entry("non-stop", nonStopTarget)],
    async complete() {
      return response("length", [text("incomplete")]);
    },
  });
  const emptyTarget = longAssistant();
  const emptyFailure = createContext({
    cwd: directory,
    branch: [entry("user", user("please explain")), entry("empty", emptyTarget)],
    async complete() {
      return response("stop", [text("   ")]);
    },
  });

  await extension.endAgent({ type: "agent_end", messages: [providerTarget] } as AgentEndEvent, providerFailure.context);
  await extension.endAgent({ type: "agent_end", messages: [nonStopTarget] } as AgentEndEvent, nonStopFailure.context);
  await extension.endAgent({ type: "agent_end", messages: [emptyTarget] } as AgentEndEvent, emptyFailure.context);

  assert.deepEqual(extension.appendedEntries, []);
  assert.deepEqual(providerFailure.notifications, [{ message: "SLYE could not create a rewrite.", type: "warning" }]);
  assert.deepEqual(nonStopFailure.notifications, []);
  assert.deepEqual(emptyFailure.notifications, []);
});

test("an append failure leaves the original alone and warns", async (t) => {
  const directory = await setupConfiguredDirectory(t, true);
  const target = longAssistant();
  const extension = createExtension({ appendThrows: true });
  const testContext = createContext({
    cwd: directory,
    branch: [entry("user", user("please explain")), entry("target", target)],
  });

  await extension.endAgent({ type: "agent_end", messages: [target] } as AgentEndEvent, testContext.context);

  assert.deepEqual(extension.appendedEntries, []);
  assert.deepEqual(testContext.notifications, [{ message: "SLYE could not create a rewrite.", type: "warning" }]);
});

test("an unexpected processing failure leaves the original alone and warns once", async (t) => {
  const directory = await setupConfiguredDirectory(t, true);
  const target = longAssistant();
  const extension = createExtension();
  const testContext = createContext({
    cwd: directory,
    branch: [],
    throwWhenReadingBranch: true,
  });
  const event = { type: "agent_end", messages: [target] } as AgentEndEvent;

  await extension.endAgent(event, testContext.context);
  await extension.endAgent(event, testContext.context);

  assert.deepEqual(extension.appendedEntries, []);
  assert.deepEqual(testContext.notifications, [{ message: "SLYE could not create a rewrite.", type: "warning" }]);
});

test("manual branch failures leave the original alone and warn once", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const extension = createExtension();
  const testContext = createContext({
    cwd: directory,
    branch: [],
    throwWhenReadingBranch: true,
  });

  await extension.command.handler("", testContext.context);
  await extension.command.handler("", testContext.context);

  assert.equal(testContext.completionCalls, 0);
  assert.deepEqual(extension.appendedEntries, []);
  assert.deepEqual(testContext.notifications, [{ message: "SLYE could not create a rewrite.", type: "warning" }]);
});

test("automatic working-message failures release the target for a manual retry without reattempting automatically", async (t) => {
  const directory = await setupConfiguredDirectory(t, true);
  const target = longAssistant();
  const branch = [entry("target", target)];
  const extension = createExtension();
  const failed = createContext({ cwd: directory, branch, throwWhenSettingWorkingMessage: 1 });
  const event = { type: "agent_end", messages: [target] } as AgentEndEvent;

  await extension.endAgent(event, failed.context);
  await extension.endAgent(event, failed.context);

  assert.equal(failed.completionCalls, 0);
  assert.deepEqual(failed.notifications, [{ message: "SLYE could not create a rewrite.", type: "warning" }]);

  const retried = createContext({ cwd: directory, branch });
  await extension.command.handler("", retried.context);

  assert.equal(retried.completionCalls, 1);
  assert.equal(extension.appendedEntries.length, 1);
});

test("manual custom UI failures release the target for a later retry", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const target = longAssistant([text("Short response.")]);
  const branch = [entry("target", target)];
  const extension = createExtension();
  const failed = createContext({ cwd: directory, branch, throwWhenOpeningCustom: 1 });

  await extension.command.handler("", failed.context);

  assert.equal(failed.completionCalls, 0);
  assert.deepEqual(failed.notifications, [{ message: "SLYE could not create a rewrite.", type: "warning" }]);

  const retried = createContext({ cwd: directory, branch });
  await extension.command.handler("", retried.context);

  assert.equal(retried.completionCalls, 1);
  assert.equal(extension.appendedEntries.length, 1);
});

test("manually rewrites a short response with a disabled model after waiting for idle", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const target = longAssistant([text("Short response.")]);
  const branch = [entry("user", user("please explain")), entry("target", target)];
  const commandSignal = new AbortController().signal;
  let requestSignal: AbortSignal | undefined;
  let idle = false;
  const extension = createExtension();
  const testContext = createContext({
    cwd: directory,
    branch,
    signal: commandSignal,
    async waitForIdle() {
      idle = true;
    },
    onGetBranch() {
      assert.equal(idle, true);
    },
    async complete(_model, _request, options) {
      requestSignal = options.signal;
      return response("stop", [text("Plain response.")]);
    },
  });

  await extension.command.handler("   ", testContext.context);

  assert.equal(testContext.waitForIdleCalls, 1);
  assert.equal(testContext.completionCalls, 1);
  assert.notEqual(requestSignal, commandSignal);
  assert.deepEqual(extension.appendedEntries, [
    { customType: "slye.rewrite", data: { display: "Plain response.", targetEntryId: "target" } },
  ]);
});

test("manual command stops before configuration without a completed response and outside TUI", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const extension = createExtension();
  const noTarget = createContext({ cwd: directory, branch: [entry("user", user("new request"))] });

  await extension.command.handler("", noTarget.context);

  assert.equal(noTarget.waitForIdleCalls, 1);
  assert.equal(noTarget.findCalls, 0);
  assert.deepEqual(noTarget.selectedTitles, []);
  assert.deepEqual(noTarget.notifications, [
    { message: "There is no latest completed response to rewrite.", type: "info" },
  ]);

  const target = longAssistant([text("Short response.")]);
  const print = createContext({ cwd: directory, branch: [entry("target", target)], mode: "print" });
  await extension.command.handler("", print.context);
  assert.equal(print.waitForIdleCalls, 0);
  assert.equal(print.completionCalls, 0);
});

test("manual picker saves a replacement as disabled and cancellation leaves configuration alone", async (t) => {
  const directory = await setupConfiguredDirectory(t, true);
  const configPath = join(process.env.PI_CODING_AGENT_DIR ?? "", "slye.json");
  const oldConfig = { enabled: true, model: { provider: "old", id: "gone" } } as const;
  await writeConfigAtomically(configPath, oldConfig);
  const savedContents = await readFile(configPath, "utf8");
  const target = longAssistant([text("Short response.")]);
  const branch = [entry("target", target)];
  const extension = createExtension();

  const pickerCancelled = createContext({ cwd: directory, branch, customInputBatches: [["\u001b"]] });
  await extension.command.handler("", pickerCancelled.context);
  assert.equal(await readFile(configPath, "utf8"), savedContents);
  assert.equal(pickerCancelled.completionCalls, 0);

  const scopeCancelled = createContext({ cwd: directory, branch, customInputBatches: [["\r"]] });
  await extension.command.handler("", scopeCancelled.context);
  assert.equal(await readFile(configPath, "utf8"), savedContents);
  assert.deepEqual(scopeCancelled.selectedTitles, ["Save SLYE model for"]);

  const selected = createContext({
    cwd: directory,
    branch,
    customInputBatches: [["\r"], []],
    selectAnswers: ["All projects"],
  });
  await extension.command.handler("", selected.context);
  assert.deepEqual(await readConfigFile(configPath), { enabled: false, model: { provider: "test", id: "model" } });
  assert.equal(selected.completionCalls, 1);
});

test("manual invalid configuration is not changed and unknown arguments show usage", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const configPath = join(process.env.PI_CODING_AGENT_DIR ?? "", "slye.json");
  const contents = "{ invalid\n";
  await writeFile(configPath, contents, "utf8");
  const target = longAssistant([text("Short response.")]);
  const extension = createExtension();
  const testContext = createContext({ cwd: directory, branch: [entry("target", target)] });

  await extension.command.handler("", testContext.context);
  await extension.command.handler("wat", testContext.context);

  assert.equal(await readFile(configPath, "utf8"), contents);
  assert.equal(testContext.completionCalls, 0);
  assert.deepEqual(testContext.notifications, [
    {
      message: `SLYE configuration is invalid at ${configPath}. It was not changed. Run /slye model.`,
      type: "warning",
    },
    { message: "Usage: /slye [model|on|off]", type: "info" },
  ]);
});

test("manual and automatic successes, including resumed cards, suppress duplicates", async (t) => {
  const directory = await setupConfiguredDirectory(t, true);
  const target = longAssistant();
  const branch = [entry("target", target)];
  const extension = createExtension();
  const testContext = createContext({ cwd: directory, branch });

  await extension.command.handler("", testContext.context);
  await extension.command.handler("", testContext.context);
  await extension.endAgent({ type: "agent_end", messages: [target] } as AgentEndEvent, testContext.context);

  assert.equal(testContext.completionCalls, 1);
  assert.deepEqual(testContext.notifications, [
    { message: "The latest response already has a SLYE rewrite.", type: "info" },
  ]);

  const resumed = createExtension();
  const explicit = createContext({
    cwd: directory,
    branch: [...branch, rewriteEntry("new-card", { display: "Saved", targetEntryId: "target" })],
  });
  await resumed.command.handler("", explicit.context);
  assert.equal(explicit.completionCalls, 0);

  const legacy = createContext({
    cwd: directory,
    branch: [...branch, rewriteEntry("legacy-card", { display: "Saved", targetEntryId: "  " })],
  });
  await resumed.command.handler("", legacy.context);
  await resumed.endAgent({ type: "agent_end", messages: [target] } as AgentEndEvent, legacy.context);
  assert.equal(legacy.completionCalls, 0);
});

test("automatic failures and append failures can be retried manually without retrying automatic events", async (t) => {
  const directory = await setupConfiguredDirectory(t, true);
  const target = longAssistant();
  const branch = [entry("target", target)];
  let calls = 0;
  const extension = createExtension({ appendThrows: 1 });
  const testContext = createContext({
    cwd: directory,
    branch,
    async complete() {
      calls += 1;
      if (calls === 1) {
        throw new Error("provider failed");
      }
      return response("stop", [text("Plain response.")]);
    },
  });
  const event = { type: "agent_end", messages: [target] } as AgentEndEvent;

  await extension.endAgent(event, testContext.context);
  await extension.endAgent(event, testContext.context);
  await extension.command.handler("", testContext.context);
  await extension.command.handler("", testContext.context);
  await extension.command.handler("", testContext.context);

  assert.equal(calls, 3);
  assert.equal(extension.appendedEntries.length, 1);
  assert.deepEqual(testContext.notifications, [
    { message: "SLYE could not create a rewrite.", type: "warning" },
    { message: "The latest response already has a SLYE rewrite.", type: "info" },
  ]);
});

test("an automatic request and a manual request claim the target before either can duplicate it", async (t) => {
  const directory = await setupConfiguredDirectory(t, true);
  const target = longAssistant();
  const branch = [entry("target", target)];
  let resolveCompletion: ((value: unknown) => void) | undefined;
  let resolveStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  const extension = createExtension();
  const testContext = createContext({
    cwd: directory,
    branch,
    complete() {
      resolveStarted?.();
      return new Promise((resolve) => {
        resolveCompletion = resolve;
      });
    },
  });

  const automatic = extension.endAgent({ type: "agent_end", messages: [target] } as AgentEndEvent, testContext.context);
  await started;
  await extension.command.handler("", testContext.context);
  resolveCompletion?.(response("stop", [text("Plain response.")]));
  await automatic;

  assert.equal(testContext.completionCalls, 1);
  assert.equal(extension.appendedEntries.length, 1);
  assert.deepEqual(testContext.notifications, [
    { message: "SLYE is already rewriting the latest response.", type: "info" },
  ]);
});

test("Escape cancels the manual loader silently and a later manual request succeeds", async (t) => {
  const directory = await setupConfiguredDirectory(t, false);
  const target = longAssistant([text("Short response.")]);
  const branch = [entry("target", target)];
  let calls = 0;
  let requestSignal: AbortSignal | undefined;
  const extension = createExtension();
  const cancelled = createContext({
    cwd: directory,
    branch,
    customInputBatches: [["\u001b"]],
    complete(_model, _request, options) {
      calls += 1;
      requestSignal = options.signal;
      return new Promise(() => undefined);
    },
  });

  await extension.command.handler("", cancelled.context);
  await Promise.resolve();
  assert.equal(requestSignal?.aborted, true);
  assert.deepEqual(extension.appendedEntries, []);
  assert.deepEqual(cancelled.notifications, []);

  const retried = createContext({ cwd: directory, branch });
  await extension.command.handler("", retried.context);
  assert.equal(calls, 1);
  assert.equal(retried.completionCalls, 1);
  assert.equal(extension.appendedEntries.length, 1);
});

test("registers a safe persistent entry renderer", () => {
  const extension = createExtension();
  if (extension.renderer === undefined) {
    throw new Error("SLYE did not register its entry renderer");
  }
  const theme = {
    bg(_name: string, text: string) {
      return text;
    },
    bold(text: string) {
      return text;
    },
  };
  const entry = {
    type: "custom" as const,
    id: "saved",
    parentId: null,
    timestamp: "now",
    customType: "slye.rewrite",
    data: { display: "Saved Markdown" },
  };

  const restored = extension.renderer(entry, { expanded: false }, theme as never);
  const metadataRestored = extension.renderer(
    { ...entry, data: { display: "New Markdown", targetEntryId: "target" } },
    { expanded: false },
    theme as never,
  );
  assert.match(restored?.render(120).join("\n") ?? "", /🤌 Speak like you eat:/);
  assert.match(restored?.render(120).join("\n") ?? "", /Saved Markdown/);
  assert.match(metadataRestored?.render(120).join("\n") ?? "", /New Markdown/);
  assert.match(
    extension
      .renderer?.(
        { ...entry, data: { display: "Malformed metadata", targetEntryId: 1 } },
        { expanded: false },
        theme as never,
      )
      ?.render(120)
      .join("\n") ?? "",
    /Malformed metadata/,
  );
  assert.equal(extension.appendedEntries.length, 0);
  assert.doesNotThrow(() =>
    extension.renderer?.({ ...entry, data: { old: true } }, { expanded: false }, theme as never),
  );
});

async function setupConfiguredDirectory(t: test.TestContext, enabled: boolean): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "slye-display-"));
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

function longAssistant(
  content: Array<{ type: "text"; text: string }> = [text("complete response ".repeat(20))],
): AgentMessage {
  return { role: "assistant", content, stopReason: "stop", timestamp: 2 } as AgentMessage;
}

function response(stopReason: string, content: unknown): unknown {
  return { stopReason, content };
}

function text(value: string): { type: "text"; text: string } {
  return { type: "text", text: value };
}

function user(content: string): AgentMessage {
  return { role: "user", content, timestamp: 1 } as AgentMessage;
}

function entry(id: string, message: AgentMessage): SessionEntry {
  return { type: "message", id, parentId: null, timestamp: "now", message } as SessionEntry;
}

function rewriteEntry(id: string, data: unknown): SessionEntry {
  return {
    type: "custom",
    id,
    parentId: null,
    timestamp: "now",
    customType: "slye.rewrite",
    data,
  } as SessionEntry;
}

async function readConfigFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
