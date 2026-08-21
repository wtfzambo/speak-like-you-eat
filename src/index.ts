import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  BorderedLoader,
  CONFIG_DIR_NAME,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  getAgentDir,
  getMarkdownTheme,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { Box, Markdown, Text } from "@earendil-works/pi-tui";
import {
  CONFIG_FILENAME,
  type EffectiveConfig,
  loadEffectiveConfig,
  type ModelReference,
  readConfig,
  type SlyeConfig,
  writeConfigAtomically,
} from "./config.ts";
import { completeModel, lowestSupportedThinkingLevel, type ThinkingLevel } from "./model-completion.ts";
import { formatModelCandidate, pickModel, selectModelCandidates } from "./model-picker.ts";
import { completeRewrite, type RewriteOutcome } from "./model-rewrite.ts";
import { type PreparedRewriteRequest, prepareManualRewriteRequest, prepareRewriteRequest } from "./rewrite.ts";

const USAGE = "Usage: /slye [model|on|off]";
const MISSING_MODEL_GUIDANCE =
  "SLYE has no model configured. Run /slye model to configure manual rewrites, or /slye on to configure and enable automatic rewrites.";
const MODEL_SCOPE_ALL = "All projects";
const MODEL_SCOPE_PROJECT = "This project only";
const REWRITE_ENTRY_TYPE = "slye.rewrite";
const REWRITE_HEADING = "🤌 Speak like you eat:";
const NO_TARGET_MESSAGE = "There is no latest completed response to rewrite.";
const DUPLICATE_MESSAGE = "The latest response already has a SLYE rewrite.";
const IN_FLIGHT_MESSAGE = "SLYE is already rewriting the latest response.";

type SlyePaths = {
  global: string;
  project: string;
};

type PiModel = NonNullable<ReturnType<ExtensionContext["modelRegistry"]["find"]>>;
type UsableModel = { model: PiModel; thinkingLevel: ThinkingLevel };
type RewriteEntryData = { display: string; targetEntryId?: string };
type ManualTargetInspection =
  | { kind: "no-target" }
  | { kind: "duplicate"; prepared: PreparedRewriteRequest }
  | { kind: "in-flight"; prepared: PreparedRewriteRequest }
  | { kind: "ready"; prepared: PreparedRewriteRequest };

export default function speakLikeYouEat(pi: ExtensionAPI): void {
  let hasShownStartupWarning = false;
  let hasShownProcessingWarning = false;
  const inFlightTargetEntryIds = new Set<string>();
  const automaticallyAttemptedTargetEntryIds = new Set<string>();
  const completedTargetEntryIds = new Set<string>();

  pi.registerEntryRenderer<RewriteEntryData>(REWRITE_ENTRY_TYPE, (entry, _options, theme) => {
    const data = parseRewriteEntryData(entry.data);
    if (data === undefined) {
      return undefined;
    }

    const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
    box.addChild(new Text(theme.bold(REWRITE_HEADING), 0, 0));
    box.addChild(new Markdown(data.display, 0, 1, getMarkdownTheme()));
    return box;
  });

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") {
      return;
    }

    const effectiveConfig = await loadConfig(ctx);
    if (effectiveConfig.kind === "unconfigured") {
      notifyStartupWarning(ctx, MISSING_MODEL_GUIDANCE);
      return;
    }
    if (effectiveConfig.kind === "invalid") {
      notifyStartupWarning(ctx, `SLYE configuration is invalid at ${effectiveConfig.path}. Fix it or run /slye model.`);
      return;
    }
    if (effectiveConfig.config.model === undefined) {
      notifyStartupWarning(ctx, MISSING_MODEL_GUIDANCE);
      return;
    }
    if (!effectiveConfig.config.enabled) {
      return;
    }
    if (resolveUsableModel(ctx, effectiveConfig.config.model) === undefined) {
      notifyStartupWarning(ctx, "SLYE's selected model is unavailable. Run /slye model.");
    }
  });

  pi.on("agent_end", async (event, ctx) => {
    if (ctx.mode !== "tui") {
      return;
    }

    try {
      const effectiveConfig = await loadConfig(ctx);
      if (effectiveConfig.kind !== "valid" || !effectiveConfig.config.enabled) {
        return;
      }

      const model = resolveUsableModel(ctx, effectiveConfig.config.model);
      if (model === undefined) {
        return;
      }

      const branch = ctx.sessionManager.getBranch();
      const prepared = prepareRewriteRequest(event.messages, branch);
      if (prepared === undefined || !claimAutomaticTarget(branch, prepared.entryId)) {
        return;
      }

      try {
        ctx.ui.setWorkingMessage("Rewriting AI-speak…");
        const outcome = await rewriteTarget(ctx, model, prepared, ctx.signal);
        if (outcome.kind === "failed") {
          notifyProcessingWarning(ctx);
        }
      } catch {
        notifyProcessingWarning(ctx);
      } finally {
        try {
          ctx.ui.setWorkingMessage();
        } catch {
          notifyProcessingWarning(ctx);
        }
        inFlightTargetEntryIds.delete(prepared.entryId);
      }
    } catch {
      notifyProcessingWarning(ctx);
    }
  });

  pi.registerCommand("slye", {
    description: "Rewrite the latest response or configure Speak like you eat",
    getArgumentCompletions: (prefix) => {
      const commands = ["model", "on", "off"];
      const matches = commands.filter((command) => command.startsWith(prefix));
      return matches.length === 0 ? null : matches.map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        return;
      }

      const command = args.trim();
      if (command === "") {
        try {
          await rewriteLatestResponse(ctx);
        } catch {
          notifyProcessingWarning(ctx);
        }
        return;
      }
      if (command === "model") {
        const effectiveConfig = await loadConfig(ctx);
        const enabled = effectiveConfig.kind === "valid" ? effectiveConfig.config.enabled : false;
        await chooseAndSaveModel(ctx, enabled);
        return;
      }
      if (command === "off") {
        await turnOff(ctx);
        return;
      }
      if (command === "on") {
        await turnOn(ctx);
        return;
      }

      ctx.ui.notify(USAGE, "info");
    },
  });

  async function rewriteLatestResponse(ctx: ExtensionCommandContext): Promise<void> {
    await ctx.waitForIdle();

    let inspection = inspectManualTarget(ctx.sessionManager.getBranch());
    if (inspection.kind !== "ready") {
      notifyManualTargetInspection(ctx, inspection);
      return;
    }

    const effectiveConfig = await loadConfig(ctx);
    if (effectiveConfig.kind === "invalid") {
      ctx.ui.notify(
        `SLYE configuration is invalid at ${effectiveConfig.path}. It was not changed. Run /slye model.`,
        "warning",
      );
      return;
    }

    let model =
      effectiveConfig.kind === "valid" && effectiveConfig.config.model !== undefined
        ? resolveUsableModel(ctx, effectiveConfig.config.model)
        : undefined;
    if (model === undefined) {
      model = await chooseAndSaveModel(ctx, false);
      if (model === undefined) {
        return;
      }

      inspection = inspectManualTarget(ctx.sessionManager.getBranch());
      if (inspection.kind !== "ready") {
        notifyManualTargetInspection(ctx, inspection);
        return;
      }
    }

    const claim = claimManualTarget(inspection.prepared.entryId);
    if (claim === "completed") {
      ctx.ui.notify(DUPLICATE_MESSAGE, "info");
      return;
    }
    if (claim === "in-flight") {
      ctx.ui.notify(IN_FLIGHT_MESSAGE, "info");
      return;
    }

    try {
      const outcome = await ctx.ui.custom<RewriteOutcome>((tui, theme, _keybindings, done) => {
        const loader = new BorderedLoader(tui, theme, "Rewriting AI-speak…");
        void rewriteTarget(ctx, model, inspection.prepared, loader.signal)
          .then(done)
          .catch(() => done({ kind: "failed" }));
        return loader;
      });

      if (outcome.kind === "failed") {
        notifyProcessingWarning(ctx);
      }
    } catch {
      notifyProcessingWarning(ctx);
    } finally {
      inFlightTargetEntryIds.delete(inspection.prepared.entryId);
    }
  }

  function claimAutomaticTarget(branch: readonly SessionEntry[], entryId: string): boolean {
    if (
      hasExistingRewrite(branch, entryId) ||
      completedTargetEntryIds.has(entryId) ||
      inFlightTargetEntryIds.has(entryId) ||
      automaticallyAttemptedTargetEntryIds.has(entryId)
    ) {
      return false;
    }

    automaticallyAttemptedTargetEntryIds.add(entryId);
    inFlightTargetEntryIds.add(entryId);
    return true;
  }

  function inspectManualTarget(branch: readonly SessionEntry[]): ManualTargetInspection {
    const prepared = prepareManualRewriteRequest(branch);
    if (prepared === undefined) {
      return { kind: "no-target" };
    }
    if (hasExistingRewrite(branch, prepared.entryId) || completedTargetEntryIds.has(prepared.entryId)) {
      return { kind: "duplicate", prepared };
    }
    if (inFlightTargetEntryIds.has(prepared.entryId)) {
      return { kind: "in-flight", prepared };
    }

    return { kind: "ready", prepared };
  }

  function notifyManualTargetInspection(ctx: ExtensionCommandContext, inspection: ManualTargetInspection): void {
    if (inspection.kind === "no-target") {
      ctx.ui.notify(NO_TARGET_MESSAGE, "info");
      return;
    }
    if (inspection.kind === "duplicate") {
      ctx.ui.notify(DUPLICATE_MESSAGE, "info");
      return;
    }
    if (inspection.kind === "in-flight") {
      ctx.ui.notify(IN_FLIGHT_MESSAGE, "info");
    }
  }

  function claimManualTarget(entryId: string): "claimed" | "completed" | "in-flight" {
    if (completedTargetEntryIds.has(entryId)) {
      return "completed";
    }
    if (inFlightTargetEntryIds.has(entryId)) {
      return "in-flight";
    }

    inFlightTargetEntryIds.add(entryId);
    return "claimed";
  }

  async function rewriteTarget(
    ctx: ExtensionContext,
    model: UsableModel,
    prepared: PreparedRewriteRequest,
    signal: AbortSignal | undefined,
  ): Promise<RewriteOutcome> {
    try {
      const outcome = await completeRewrite(prepared.request, signal, (request, options) =>
        completeModel(ctx.modelRegistry, model.model, request, options),
      );
      if (outcome.kind !== "success") {
        return outcome;
      }

      await pi.appendEntry<RewriteEntryData>(REWRITE_ENTRY_TYPE, {
        display: outcome.display,
        targetEntryId: prepared.entryId,
      });
      completedTargetEntryIds.add(prepared.entryId);
      return outcome;
    } catch {
      return { kind: "failed" };
    }
  }

  function notifyStartupWarning(ctx: ExtensionContext, message: string): void {
    if (hasShownStartupWarning) {
      return;
    }

    hasShownStartupWarning = true;
    ctx.ui.notify(message, "warning");
  }

  function notifyProcessingWarning(ctx: ExtensionContext): void {
    if (hasShownProcessingWarning) {
      return;
    }

    hasShownProcessingWarning = true;
    ctx.ui.notify("SLYE could not create a rewrite.", "warning");
  }
}

async function chooseAndSaveModel(ctx: ExtensionCommandContext, enabled: boolean): Promise<UsableModel | undefined> {
  const scopedCandidates = selectModelCandidates(
    ctx.scopedModels.map(({ model }) => model),
    (model) => ctx.modelRegistry.hasConfiguredAuth(model),
  );
  const allCandidates = selectModelCandidates(ctx.modelRegistry.getAvailable(), (model) =>
    ctx.modelRegistry.hasConfiguredAuth(model),
  );
  if (scopedCandidates.length === 0 && allCandidates.length === 0) {
    ctx.ui.notify("No authenticated models are available for SLYE.", "warning");
    return undefined;
  }

  const selected = await pickModel(ctx, scopedCandidates, allCandidates);
  if (selected === undefined) {
    return undefined;
  }

  const model = { provider: selected.provider, id: selected.id };
  const usableModel = resolveUsableModel(ctx, model);
  if (usableModel === undefined) {
    ctx.ui.notify("SLYE's selected model is unavailable. Run /slye model.", "warning");
    return undefined;
  }

  const projectTrusted = ctx.isProjectTrusted();
  const scopes = projectTrusted ? [MODEL_SCOPE_ALL, MODEL_SCOPE_PROJECT] : [MODEL_SCOPE_ALL];
  const selectedScope = await ctx.ui.select("Save SLYE model for", scopes);
  if (selectedScope === undefined) {
    return undefined;
  }

  const config: SlyeConfig = enabled ? { enabled: true, model } : { enabled: false, model };
  const paths = getConfigPaths(ctx);
  let saved = false;

  if (selectedScope === MODEL_SCOPE_PROJECT) {
    saved = await saveModelConfig(ctx, paths.project, config, MODEL_SCOPE_PROJECT, formatModelCandidate(selected));
  }
  if (selectedScope === MODEL_SCOPE_ALL) {
    saved = await saveGlobalConfig(ctx, paths, projectTrusted, config, formatModelCandidate(selected));
  }

  return saved ? usableModel : undefined;
}

async function saveGlobalConfig(
  ctx: ExtensionCommandContext,
  paths: SlyePaths,
  projectTrusted: boolean,
  config: SlyeConfig,
  label: string,
): Promise<boolean> {
  let removeProjectConfig = false;
  if (projectTrusted) {
    const projectConfig = await readConfig(paths.project);
    if (projectConfig.kind !== "missing") {
      const confirmed = await ctx.ui.confirm(
        "Project SLYE configuration",
        "The project file takes precedence over and blocks the global setting in this project. Remove it and use the global setting?",
      );
      if (!confirmed) {
        return false;
      }
      removeProjectConfig = true;
    }
  }

  try {
    await writeConfigAtomically(paths.global, config);
  } catch {
    ctx.ui.notify("Could not save SLYE configuration.", "warning");
    return false;
  }

  if (removeProjectConfig) {
    try {
      await rm(paths.project);
    } catch {
      ctx.ui.notify(
        "Global SLYE configuration was saved, but the project file could not be removed. The project file still takes precedence in this project.",
        "warning",
      );
      return false;
    }
  }

  ctx.ui.notify(formatSavedModelMessage(config.enabled, label, MODEL_SCOPE_ALL), "info");
  return true;
}

async function turnOff(ctx: ExtensionCommandContext): Promise<void> {
  const effectiveConfig = await loadConfig(ctx);
  if (effectiveConfig.kind === "invalid") {
    ctx.ui.notify(`SLYE configuration is invalid at ${effectiveConfig.path}. It was not changed.`, "warning");
    return;
  }
  const path = effectiveConfig.kind === "valid" ? effectiveConfig.path : getConfigPaths(ctx).global;
  const model = effectiveConfig.kind === "valid" ? effectiveConfig.config.model : undefined;
  const config: SlyeConfig = model === undefined ? { enabled: false } : { enabled: false, model };

  try {
    await writeConfigAtomically(path, config);
  } catch {
    ctx.ui.notify("Could not save SLYE configuration.", "warning");
    return;
  }

  ctx.ui.notify("SLYE automatic rewrites are off. Manual /slye remains available.", "info");
}

async function turnOn(ctx: ExtensionCommandContext): Promise<void> {
  const effectiveConfig = await loadConfig(ctx);
  if (effectiveConfig.kind === "invalid") {
    ctx.ui.notify(`SLYE configuration is invalid at ${effectiveConfig.path}. Repair it or run /slye model.`, "warning");
    return;
  }
  if (effectiveConfig.kind === "valid" && effectiveConfig.config.model !== undefined) {
    const model = effectiveConfig.config.model;
    const usableModel = resolveUsableModel(ctx, model);
    if (usableModel !== undefined) {
      const scope = effectiveConfig.scope === "project" ? MODEL_SCOPE_PROJECT : MODEL_SCOPE_ALL;
      await saveModelConfig(
        ctx,
        effectiveConfig.path,
        { enabled: true, model },
        scope,
        formatModelCandidate({ ...model, thinkingLevel: usableModel.thinkingLevel }),
      );
      return;
    }
  }

  await chooseAndSaveModel(ctx, true);
}

async function saveModelConfig(
  ctx: ExtensionCommandContext,
  path: string,
  config: SlyeConfig,
  scope: string,
  label: string,
): Promise<boolean> {
  try {
    await writeConfigAtomically(path, config);
  } catch {
    ctx.ui.notify("Could not save SLYE configuration.", "warning");
    return false;
  }

  ctx.ui.notify(formatSavedModelMessage(config.enabled, label, scope), "info");
  return true;
}

function formatSavedModelMessage(enabled: boolean, label: string, scope: string): string {
  if (enabled) {
    return `SLYE enabled with ${label} for ${scope}.`;
  }

  return `SLYE manual rewrites configured with ${label} for ${scope}.`;
}

function parseRewriteEntryData(data: unknown): RewriteEntryData | undefined {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return undefined;
  }
  if (!("display" in data) || typeof data.display !== "string") {
    return undefined;
  }

  const targetEntryId =
    "targetEntryId" in data && typeof data.targetEntryId === "string" && data.targetEntryId.trim() !== ""
      ? data.targetEntryId
      : undefined;
  return targetEntryId === undefined ? { display: data.display } : { display: data.display, targetEntryId };
}

function hasExistingRewrite(branch: readonly SessionEntry[], targetEntryId: string): boolean {
  let latestAssistantEntryId: string | undefined;

  for (const entry of branch) {
    if (entry?.type === "message" && entry.message.role === "assistant") {
      latestAssistantEntryId = entry.id;
      continue;
    }
    if (entry?.type !== "custom" || entry.customType !== REWRITE_ENTRY_TYPE) {
      continue;
    }

    const data = parseRewriteEntryData(entry.data);
    if (data === undefined) {
      continue;
    }
    if (data.targetEntryId === targetEntryId) {
      return true;
    }
    if (data.targetEntryId === undefined && latestAssistantEntryId === targetEntryId) {
      return true;
    }
  }

  return false;
}

async function loadConfig(ctx: ExtensionContext): Promise<EffectiveConfig> {
  const paths = getConfigPaths(ctx);
  return loadEffectiveConfig(paths.global, paths.project, ctx.isProjectTrusted());
}

function getConfigPaths(ctx: ExtensionContext): SlyePaths {
  return {
    global: join(getAgentDir(), CONFIG_FILENAME),
    project: join(ctx.cwd, CONFIG_DIR_NAME, CONFIG_FILENAME),
  };
}

function resolveUsableModel(ctx: ExtensionContext, reference: ModelReference): UsableModel | undefined {
  const model = ctx.modelRegistry.find(reference.provider, reference.id);
  if (model === undefined) {
    return undefined;
  }
  if (!ctx.modelRegistry.hasConfiguredAuth(model)) {
    return undefined;
  }

  const thinkingLevel = lowestSupportedThinkingLevel(model);
  if (thinkingLevel === undefined) {
    return undefined;
  }

  return { model, thinkingLevel };
}
