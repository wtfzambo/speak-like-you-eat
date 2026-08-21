import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CONFIG_DIR_NAME,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { CONFIG_FILENAME, readConfig, writeConfigAtomically } from "../src/config.ts";
import speakLikeYouEat from "../src/index.ts";
import { formatModelCandidate, selectModelCandidates } from "../src/model-picker.ts";
import { createModelPickerDriver } from "./picker-driver.ts";

type PiModel = ReturnType<ExtensionContext["modelRegistry"]["getAvailable"]>[number];
type Notification = { message: string; type: "info" | "warning" | "error" | undefined };
type Confirmation = { title: string; message: string };
type RegisteredCommand = {
  handler(args: string, ctx: ExtensionCommandContext): Promise<void>;
};

function model(provider: string, id: string): PiModel {
  return { provider, id } as PiModel;
}

function createExtension(): {
  command: RegisteredCommand;
  startSession: (ctx: ExtensionContext) => Promise<void>;
} {
  let command: RegisteredCommand | undefined;
  let startSession: ((ctx: ExtensionContext) => Promise<void>) | undefined;
  const api = {
    on(event: string, handler: unknown) {
      if (event === "session_start") {
        startSession = async (ctx) => {
          await (handler as (event: { type: "session_start" }, context: ExtensionContext) => Promise<void>)(
            { type: "session_start" },
            ctx,
          );
        };
      }
    },
    registerCommand(_name: string, registered: RegisteredCommand) {
      command = registered;
    },
    registerEntryRenderer() {
      // The display renderer is exercised in display.test.ts.
    },
  } as unknown as ExtensionAPI;

  speakLikeYouEat(api);
  if (command === undefined || startSession === undefined) {
    throw new Error("SLYE did not register its command and session handler");
  }
  return { command, startSession };
}

function createContext(options: {
  cwd: string;
  mode?: "tui" | "print";
  trusted?: boolean;
  models?: PiModel[];
  authenticated?: (model: PiModel) => boolean;
  selectAnswers?: Array<string | undefined>;
  confirmAnswers?: boolean[];
  scopedModels?: Array<{ model: PiModel; thinkingLevel?: string }>;
  customInputs?: string[];
}): {
  context: ExtensionCommandContext;
  notifications: Notification[];
  selectedTitles: string[];
  confirmationMessages: Confirmation[];
  pickerRenders: string[];
} {
  const notifications: Notification[] = [];
  const selectedTitles: string[] = [];
  const confirmationMessages: Confirmation[] = [];
  const driver = createModelPickerDriver(options.customInputs ?? ["\r"]);
  const models = options.models ?? [];
  const selectAnswers = [...(options.selectAnswers ?? [])];
  const confirmAnswers = [...(options.confirmAnswers ?? [])];
  const authenticated = options.authenticated ?? (() => true);
  const registry = {
    getAvailable: () => models,
    find: (provider: string, id: string) =>
      models.find((candidate) => candidate.provider === provider && candidate.id === id),
    hasConfiguredAuth: authenticated,
  };
  const context = {
    mode: options.mode ?? "tui",
    cwd: options.cwd,
    scopedModels: options.scopedModels ?? [],
    modelRegistry: registry,
    isProjectTrusted: () => options.trusted ?? false,
    ui: {
      notify(message: string, type?: Notification["type"]) {
        notifications.push({ message, type });
      },
      custom(factory: Parameters<ExtensionCommandContext["ui"]["custom"]>[0]) {
        return driver.run(factory);
      },
      async select(title: string): Promise<string | undefined> {
        selectedTitles.push(title);
        return selectAnswers.shift();
      },
      async confirm(title: string, message: string): Promise<boolean> {
        confirmationMessages.push({ title, message });
        return confirmAnswers.shift() ?? false;
      },
    },
  } as unknown as ExtensionCommandContext;

  return { context, notifications, selectedTitles, confirmationMessages, pickerRenders: driver.renders };
}

test("selects authenticated candidates, removes duplicates, and orders them", () => {
  const alpha = model("alpha", "one");
  const beta = model("beta", "two");
  const unavailable = model("alpha", "three");

  assert.deepEqual(
    selectModelCandidates([beta, alpha, beta, unavailable], (candidate) => candidate !== unavailable).map(
      formatModelCandidate,
    ),
    ["alpha / one · thinking: off", "beta / two · thinking: off"],
  );
  assert.deepEqual(selectModelCandidates([beta, alpha], () => true).map(formatModelCandidate), [
    "alpha / one · thinking: off",
    "beta / two · thinking: off",
  ]);
});

test("warns non-modally on an unconfigured TUI session and does nothing outside TUI", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "slye-onboarding-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = join(directory, "agent");
  t.after(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  });

  const extension = createExtension();
  const tui = createContext({ cwd: join(directory, "project") });
  await extension.startSession(tui.context);
  assert.deepEqual(tui.notifications, [
    {
      message:
        "SLYE has no model configured. Run /slye model to configure manual rewrites, or /slye on to configure and enable automatic rewrites.",
      type: "warning",
    },
  ]);

  const print = createContext({ cwd: join(directory, "print-project"), mode: "print" });
  await extension.startSession(print.context);
  await extension.command.handler("model", print.context);
  assert.deepEqual(print.notifications, []);
  assert.equal((await readConfig(join(directory, "agent", "slye.json"))).kind, "missing");
});

test("/slye model writes the selected trusted project configuration", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "slye-onboarding-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const chosen = model("openai", "gpt-5");
  const extension = createExtension();
  const { context, notifications } = createContext({
    cwd: join(directory, "project"),
    trusted: true,
    models: [chosen],
    scopedModels: [{ model: chosen, thinkingLevel: "high" }],
    selectAnswers: ["This project only"],
  });
  await extension.command.handler("model", context);

  const path = join(directory, "project", CONFIG_DIR_NAME, "slye.json");
  assert.deepEqual(await readConfig(path), {
    kind: "valid",
    path,
    config: { enabled: false, model: { provider: "openai", id: "gpt-5" } },
  });
  assert.deepEqual(notifications, [
    {
      message: "SLYE manual rewrites configured with openai / gpt-5 · thinking: off for This project only.",
      type: "info",
    },
  ]);
});

test("/slye model can select an all-only authenticated model after opening scoped", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "slye-onboarding-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDirectory = join(directory, "agent");
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  t.after(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  });

  const scoped = model("openai", "scoped");
  const allOnly = model("zeta", "all-only");
  const extension = createExtension();
  const { context, notifications, pickerRenders } = createContext({
    cwd: join(directory, "project"),
    models: [scoped, allOnly],
    scopedModels: [{ model: scoped, thinkingLevel: "high" }],
    customInputs: ["\t", "\u001b[B", "\r"],
    selectAnswers: ["All projects"],
  });
  await extension.command.handler("model", context);

  const path = join(agentDirectory, "slye.json");
  assert.deepEqual(await readConfig(path), {
    kind: "valid",
    path,
    config: { enabled: false, model: { provider: "zeta", id: "all-only" } },
  });
  assert.match(pickerRenders[0] ?? "", /Scope: Scoped models/);
  assert.match(pickerRenders[0] ?? "", /openai \/ scoped · thinking: off/);
  assert.match(pickerRenders[1] ?? "", /Scope: All authenticated models/);
  assert.deepEqual(notifications, [
    {
      message: "SLYE manual rewrites configured with zeta / all-only · thinking: off for All projects.",
      type: "info",
    },
  ]);
});

test("/slye model writes the selected global configuration", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "slye-onboarding-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDirectory = join(directory, "agent");
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  t.after(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  });

  const extension = createExtension();
  const { context } = createContext({
    cwd: join(directory, "project"),
    models: [model("openai", "gpt-5")],
    selectAnswers: ["All projects"],
  });
  await extension.command.handler("model", context);

  const path = join(agentDirectory, "slye.json");
  assert.deepEqual(await readConfig(path), {
    kind: "valid",
    path,
    config: { enabled: false, model: { provider: "openai", id: "gpt-5" } },
  });
});

test("/slye model preserves valid automatic mode and repairs invalid configuration as manual-only", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "slye-onboarding-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDirectory = join(directory, "agent");
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  t.after(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  });

  const path = join(agentDirectory, CONFIG_FILENAME);
  const chosen = model("openai", "gpt-5");
  const extension = createExtension();

  await writeConfigAtomically(path, { enabled: true, model: { provider: "old", id: "enabled" } });
  const enabled = createContext({
    cwd: join(directory, "enabled"),
    models: [chosen],
    selectAnswers: ["All projects"],
  });
  await extension.command.handler("model", enabled.context);
  assert.deepEqual(await readConfig(path), {
    kind: "valid",
    path,
    config: { enabled: true, model: { provider: "openai", id: "gpt-5" } },
  });
  assert.deepEqual(enabled.notifications, [
    { message: "SLYE enabled with openai / gpt-5 · thinking: off for All projects.", type: "info" },
  ]);

  await writeConfigAtomically(path, { enabled: false, model: { provider: "old", id: "disabled" } });
  const disabled = createContext({
    cwd: join(directory, "disabled"),
    models: [chosen],
    selectAnswers: ["All projects"],
  });
  await extension.command.handler("model", disabled.context);
  assert.deepEqual(await readConfig(path), {
    kind: "valid",
    path,
    config: { enabled: false, model: { provider: "openai", id: "gpt-5" } },
  });
  assert.deepEqual(disabled.notifications, [
    {
      message: "SLYE manual rewrites configured with openai / gpt-5 · thinking: off for All projects.",
      type: "info",
    },
  ]);

  await writeFile(path, "{ invalid", "utf8");
  const repaired = createContext({
    cwd: join(directory, "repaired"),
    models: [chosen],
    selectAnswers: ["All projects"],
  });
  await extension.command.handler("model", repaired.context);
  assert.deepEqual(await readConfig(path), {
    kind: "valid",
    path,
    config: { enabled: false, model: { provider: "openai", id: "gpt-5" } },
  });
  assert.deepEqual(repaired.notifications, [
    {
      message: "SLYE manual rewrites configured with openai / gpt-5 · thinking: off for All projects.",
      type: "info",
    },
  ]);
});

test("/slye model warns when no authenticated model has usable thinking metadata", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "slye-onboarding-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const malformed = {
    ...model("openai", "gpt-5"),
    reasoning: true,
    thinkingLevelMap: { off: null, minimal: null, low: null, medium: null, high: null, xhigh: null, max: null },
  } as PiModel;
  const extension = createExtension();
  const { context, notifications, selectedTitles } = createContext({
    cwd: join(directory, "project"),
    models: [malformed],
  });

  await extension.command.handler("model", context);

  assert.deepEqual(notifications, [{ message: "No authenticated models are available for SLYE.", type: "warning" }]);
  assert.deepEqual(selectedTitles, []);
});

test("/slye off creates disabled global configuration and /slye on without a usable model opens the picker", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "slye-onboarding-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDirectory = join(directory, "agent");
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  t.after(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  });

  const oldModel = model("old", "gone");
  const chosen = model("openai", "gpt-5");
  const extension = createExtension();
  const off = createContext({ cwd: join(directory, "project") });
  await extension.command.handler("off", off.context);
  const path = join(agentDirectory, "slye.json");
  assert.deepEqual(await readConfig(path), { kind: "valid", path, config: { enabled: false } });

  await writeConfigAtomically(path, { enabled: false, model: { provider: "old", id: "gone" } });
  const on = createContext({
    cwd: join(directory, "project"),
    models: [oldModel, chosen],
    authenticated: (candidate) => candidate === chosen,
    selectAnswers: ["All projects"],
  });
  await extension.command.handler("on", on.context);

  assert.deepEqual(on.selectedTitles, ["Save SLYE model for"]);
  assert.deepEqual(await readConfig(path), {
    kind: "valid",
    path,
    config: { enabled: true, model: { provider: "openai", id: "gpt-5" } },
  });
});

test("/slye on and off leave an invalid effective configuration unchanged", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "slye-onboarding-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDirectory = join(directory, "agent");
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  t.after(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  });

  const projectDirectory = join(directory, "project");
  const projectPath = join(projectDirectory, CONFIG_DIR_NAME, CONFIG_FILENAME);
  const invalidContents = "{ this is not valid JSON }\n";
  await writeConfigAtomically(join(agentDirectory, CONFIG_FILENAME), {
    enabled: true,
    model: { provider: "global", id: "model" },
  });
  await mkdir(join(projectDirectory, CONFIG_DIR_NAME), { recursive: true });
  await writeFile(projectPath, invalidContents, "utf8");

  const extension = createExtension();
  const on = createContext({ cwd: projectDirectory, trusted: true, models: [model("openai", "gpt-5")] });
  const off = createContext({ cwd: projectDirectory, trusted: true, models: [model("openai", "gpt-5")] });
  await extension.command.handler("on", on.context);
  await extension.command.handler("off", off.context);

  for (const result of [on, off]) {
    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0]?.type, "warning");
    assert.ok(result.notifications[0]?.message.includes(projectPath));
    assert.deepEqual(result.selectedTitles, []);
  }
  assert.equal(await readFile(projectPath, "utf8"), invalidContents);
});

test("/slye off updates only the trusted project configuration that takes precedence", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "slye-onboarding-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDirectory = join(directory, "agent");
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  t.after(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  });

  const projectDirectory = join(directory, "project");
  const globalPath = join(agentDirectory, CONFIG_FILENAME);
  const projectPath = join(projectDirectory, CONFIG_DIR_NAME, CONFIG_FILENAME);
  const globalConfig = { enabled: true, model: { provider: "global", id: "model" } } as const;
  const projectModel = { provider: "project", id: "model" } as const;
  await writeConfigAtomically(globalPath, globalConfig);
  await writeConfigAtomically(projectPath, { enabled: true, model: projectModel });
  const globalContents = await readFile(globalPath, "utf8");

  const extension = createExtension();
  const { context, notifications } = createContext({ cwd: projectDirectory, trusted: true });
  await extension.command.handler("off", context);

  assert.deepEqual(await readConfig(projectPath), {
    kind: "valid",
    path: projectPath,
    config: { enabled: false, model: projectModel },
  });
  assert.equal(await readFile(globalPath, "utf8"), globalContents);
  assert.deepEqual(notifications, [
    { message: "SLYE automatic rewrites are off. Manual /slye remains available.", type: "info" },
  ]);
});

test("/slye on restores a usable trusted project model without opening a picker", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "slye-onboarding-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDirectory = join(directory, "agent");
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  t.after(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  });

  const projectDirectory = join(directory, "project");
  const globalPath = join(agentDirectory, CONFIG_FILENAME);
  const projectPath = join(projectDirectory, CONFIG_DIR_NAME, CONFIG_FILENAME);
  const projectModel = { provider: "project", id: "model" } as const;
  await writeConfigAtomically(globalPath, { enabled: false, model: { provider: "global", id: "model" } });
  await writeConfigAtomically(projectPath, { enabled: false, model: projectModel });
  const globalContents = await readFile(globalPath, "utf8");

  const extension = createExtension();
  const { context, notifications, selectedTitles } = createContext({
    cwd: projectDirectory,
    trusted: true,
    models: [
      {
        ...model("project", "model"),
        reasoning: true,
        thinkingLevelMap: { off: null, minimal: null },
      } as PiModel,
    ],
  });
  await extension.command.handler("on", context);

  assert.deepEqual(selectedTitles, []);
  assert.deepEqual(await readConfig(projectPath), {
    kind: "valid",
    path: projectPath,
    config: { enabled: true, model: projectModel },
  });
  assert.equal(await readFile(globalPath, "utf8"), globalContents);
  assert.deepEqual(notifications, [
    { message: "SLYE enabled with project / model · thinking: low for This project only.", type: "info" },
  ]);
});

test("startup warns once for invalid configuration, guides missing models, warns for enabled unusable models, and ignores disabled models", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "slye-onboarding-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDirectory = join(directory, "agent");
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  t.after(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  });

  const projectDirectory = join(directory, "project");
  const projectPath = join(projectDirectory, CONFIG_DIR_NAME, CONFIG_FILENAME);
  await mkdir(join(projectDirectory, CONFIG_DIR_NAME), { recursive: true });
  await writeFile(projectPath, "{ invalid", "utf8");

  const invalidExtension = createExtension();
  const firstInvalidSession = createContext({ cwd: projectDirectory, trusted: true });
  const secondInvalidSession = createContext({ cwd: projectDirectory, trusted: true });
  await invalidExtension.startSession(firstInvalidSession.context);
  await invalidExtension.startSession(secondInvalidSession.context);
  assert.deepEqual(firstInvalidSession.notifications, [
    { message: `SLYE configuration is invalid at ${projectPath}. Fix it or run /slye model.`, type: "warning" },
  ]);
  assert.deepEqual(secondInvalidSession.notifications, []);

  const globalPath = join(agentDirectory, CONFIG_FILENAME);
  const configuredModel = { provider: "openai", id: "gpt-5" } as const;
  await writeConfigAtomically(globalPath, { enabled: false });
  const noModelSession = createContext({ cwd: join(directory, "no-model") });
  await createExtension().startSession(noModelSession.context);
  assert.deepEqual(noModelSession.notifications, [
    {
      message:
        "SLYE has no model configured. Run /slye model to configure manual rewrites, or /slye on to configure and enable automatic rewrites.",
      type: "warning",
    },
  ]);

  await writeConfigAtomically(globalPath, { enabled: true, model: configuredModel });
  const missingModelSession = createContext({ cwd: join(directory, "missing-model") });
  await createExtension().startSession(missingModelSession.context);
  assert.deepEqual(missingModelSession.notifications, [
    { message: "SLYE's selected model is unavailable. Run /slye model.", type: "warning" },
  ]);

  const unauthenticatedModelSession = createContext({
    cwd: join(directory, "unauthenticated-model"),
    models: [model("openai", "gpt-5")],
    authenticated: () => false,
  });
  await createExtension().startSession(unauthenticatedModelSession.context);
  assert.deepEqual(unauthenticatedModelSession.notifications, [
    { message: "SLYE's selected model is unavailable. Run /slye model.", type: "warning" },
  ]);

  const noSupportedThinkingLevelModel = {
    ...model("openai", "gpt-5"),
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: null,
      medium: null,
      high: null,
      xhigh: null,
      max: null,
    },
  } as PiModel;
  const noSupportedThinkingLevelSession = createContext({
    cwd: join(directory, "no-supported-thinking-level"),
    models: [noSupportedThinkingLevelModel],
    authenticated: () => true,
  });
  await createExtension().startSession(noSupportedThinkingLevelSession.context);
  assert.deepEqual(noSupportedThinkingLevelSession.notifications, [
    { message: "SLYE's selected model is unavailable. Run /slye model.", type: "warning" },
  ]);
  assert.deepEqual(noSupportedThinkingLevelSession.selectedTitles, []);
  assert.deepEqual(noSupportedThinkingLevelSession.confirmationMessages, []);

  await writeConfigAtomically(globalPath, { enabled: false, model: configuredModel });
  const disabledSession = createContext({ cwd: join(directory, "disabled") });
  await createExtension().startSession(disabledSession.context);
  assert.deepEqual(disabledSession.notifications, []);
});

test("global model selection removes a confirmed trusted project file and preserves files when cancelled", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "slye-onboarding-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDirectory = join(directory, "agent");
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  t.after(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  });

  const projectDirectory = join(directory, "project");
  const globalPath = join(agentDirectory, CONFIG_FILENAME);
  const projectPath = join(projectDirectory, CONFIG_DIR_NAME, CONFIG_FILENAME);
  await writeConfigAtomically(globalPath, { enabled: false, model: { provider: "global", id: "old" } });
  await writeConfigAtomically(projectPath, { enabled: true, model: { provider: "project", id: "old" } });
  const globalContents = await readFile(globalPath, "utf8");
  const projectContents = await readFile(projectPath, "utf8");

  const extension = createExtension();
  const cancelled = createContext({
    cwd: projectDirectory,
    trusted: true,
    models: [model("openai", "gpt-5")],
    selectAnswers: ["All projects"],
    confirmAnswers: [false],
  });
  await extension.command.handler("model", cancelled.context);
  assert.equal(await readFile(globalPath, "utf8"), globalContents);
  assert.equal(await readFile(projectPath, "utf8"), projectContents);
  assert.deepEqual(cancelled.confirmationMessages, [
    {
      title: "Project SLYE configuration",
      message:
        "The project file takes precedence over and blocks the global setting in this project. Remove it and use the global setting?",
    },
  ]);

  const confirmed = createContext({
    cwd: projectDirectory,
    trusted: true,
    models: [model("openai", "gpt-5")],
    selectAnswers: ["All projects"],
    confirmAnswers: [true],
  });
  await extension.command.handler("model", confirmed.context);
  assert.deepEqual(await readConfig(globalPath), {
    kind: "valid",
    path: globalPath,
    config: { enabled: true, model: { provider: "openai", id: "gpt-5" } },
  });
  assert.equal((await readConfig(projectPath)).kind, "missing");
  assert.deepEqual(confirmed.notifications, [
    { message: "SLYE enabled with openai / gpt-5 · thinking: off for All projects.", type: "info" },
  ]);
});

test("cancelled model selection performs no writes", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "slye-onboarding-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDirectory = join(directory, "agent");
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  t.after(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  });

  const extension = createExtension();
  const { context, notifications } = createContext({
    cwd: join(directory, "project"),
    models: [model("openai", "gpt-5")],
    customInputs: ["\u001b"],
  });
  await extension.command.handler("model", context);

  assert.equal((await readConfig(join(agentDirectory, "slye.json"))).kind, "missing");
  assert.equal((await readConfig(join(directory, "project", CONFIG_DIR_NAME, "slye.json"))).kind, "missing");
  assert.deepEqual(notifications, []);
});
