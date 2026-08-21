import { streamSimple } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import speakLikeYouEat from "./index.ts";

const REWRITE_ENTRY_TYPE = "slye.rewrite";
const REWRITE_HEADING = "🤌 Speak like you eat:";
const IDLE_POLL_INTERVAL_MS = 10;

type PiHandler = (event: unknown, context: ExtensionContext) => unknown;
type PiCommandOptions = {
  handler: (args: string, context: ExtensionCommandContext) => unknown;
  [key: string]: unknown;
};
type PiEntryRenderer = (entry: { data?: unknown }, options: unknown, theme: unknown) => unknown;
type RuntimeMessageRenderer = (message: { details?: unknown }, options: unknown, theme: unknown) => unknown;
type RuntimeTheme = {
  bg(color: string, text: string): string;
  bold(text: string): string;
};
type PiModelRegistry = ExtensionContext["modelRegistry"];
type PiSessionManager = ExtensionContext["sessionManager"];

type OmpModelRegistry = Omit<
  Pick<PiModelRegistry, "find" | "hasConfiguredAuth" | "getAvailable" | "getApiKeyAndHeaders" | "getProvider">,
  "getProvider"
> &
  Partial<Pick<PiModelRegistry, "getProvider">>;

type OmpSessionManager = Pick<PiSessionManager, "getBranch">;

type OmpContext = {
  ui: ExtensionContext["ui"];
  cwd: string;
  mode?: ExtensionContext["mode"];
  modelRegistry: OmpModelRegistry;
  scopedModels?: ExtensionContext["scopedModels"];
  sessionManager: OmpSessionManager;
  signal?: AbortSignal;
  isProjectTrusted?: ExtensionContext["isProjectTrusted"];
  waitForIdle?: ExtensionCommandContext["waitForIdle"];
  isIdle(): boolean;
  setTimeout(callback: () => void, milliseconds: number): unknown;
};

type OmpHandler = (event: unknown, context: OmpContext) => unknown;
type OmpCommandOptions = {
  handler: (args: string, context: OmpContext) => unknown;
  [key: string]: unknown;
};
type OmpRuntimeApi = {
  on(event: string, handler: OmpHandler): void;
  registerCommand(name: string, options: OmpCommandOptions): void;
  registerMessageRenderer(customType: string, renderer: RuntimeMessageRenderer): void;
  sendMessage(message: unknown, options?: { triggerTurn?: boolean }): void;
};

/**
 * OMP exposes a Pi-compatible extension surface, but renders persistent custom
 * messages instead of Pi's display-only custom entries. This adapter preserves
 * the released Pi behavior and translates only the SLYE seams.
 */
export default function speakLikeYouEatOmp(omp: ExtensionAPI): void {
  const runtime = omp as unknown as OmpRuntimeApi;
  registerOmpContextIsolation(runtime);
  speakLikeYouEat(createOmpExtensionApi(runtime));
}

function createOmpExtensionApi(runtime: OmpRuntimeApi): ExtensionAPI {
  const on = runtime.on.bind(runtime);
  const registerCommand = runtime.registerCommand.bind(runtime);
  const registerMessageRenderer = runtime.registerMessageRenderer.bind(runtime);
  const sendMessage = runtime.sendMessage.bind(runtime);
  // OMP serializes callbacks until appendEntry captures the current context.
  // A deferred event returns after scheduling its idle timer; the background
  // operation still awaits delivery or failure so the Pi core can clean up.
  let activeContext: OmpContext | undefined;
  let releaseHostForDeferredSend: (() => void) | undefined;

  async function runWithContext<T>(context: OmpContext, operation: () => T | Promise<T>): Promise<T> {
    const previousContext = activeContext;
    activeContext = context;
    try {
      return await operation();
    } finally {
      activeContext = previousContext;
    }
  }

  async function runEventWithContext(context: OmpContext, operation: () => unknown): Promise<unknown> {
    const previousContext = activeContext;
    const previousRelease = releaseHostForDeferredSend;
    let releaseHost: () => void = () => {};
    const deferredSend = new Promise<void>((resolve) => {
      releaseHost = resolve;
    });

    activeContext = context;
    releaseHostForDeferredSend = releaseHost;
    const operationPromise = Promise.resolve().then(operation);
    try {
      return await Promise.race([operationPromise, deferredSend]);
    } finally {
      activeContext = previousContext;
      releaseHostForDeferredSend = previousRelease;
      void operationPromise.catch(() => {});
    }
  }

  return {
    on(event: string, handler: PiHandler) {
      on(event, (payload, context) => runEventWithContext(context, () => handler(payload, adaptOmpContext(context))));
    },
    registerCommand(name: string, options: PiCommandOptions) {
      registerCommand(name, {
        ...options,
        handler: (args, context) =>
          runWithContext(context, () => options.handler(args, adaptOmpContext(context) as ExtensionCommandContext)),
      });
    },
    registerEntryRenderer(customType: string, renderer: PiEntryRenderer) {
      registerMessageRenderer(customType, (message, options, theme) => {
        try {
          return renderer({ data: message.details }, options, theme);
        } catch (error) {
          if (!isUninitializedOmpMarkdownTheme(error)) {
            throw error;
          }
          return renderRewriteFallback(message.details, theme as RuntimeTheme);
        }
      });
    },
    appendEntry(customType: string, data?: unknown) {
      if (activeContext === undefined) {
        throw new Error("SLYE attempted to append an OMP message outside an extension handler.");
      }

      return sendWhenIdle(activeContext, sendMessage, releaseHostForDeferredSend, {
        customType,
        content: "",
        display: true,
        details: data,
        attribution: "agent",
      });
    },
  } as unknown as ExtensionAPI;
}

function sendWhenIdle(
  context: OmpContext,
  sendMessage: OmpRuntimeApi["sendMessage"],
  onDeferred: (() => void) | undefined,
  message: unknown,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let hasDeferred = false;
    const send = (): void => {
      try {
        if (context.isIdle()) {
          sendMessage(message, { triggerTurn: false });
          resolve();
          return;
        }

        context.setTimeout(send, IDLE_POLL_INTERVAL_MS);
        if (!hasDeferred) {
          hasDeferred = true;
          onDeferred?.();
        }
      } catch (error) {
        reject(error);
      }
    };

    send();
  });
}

function renderRewriteFallback(data: unknown, theme: RuntimeTheme): Box | undefined {
  if (!isRecord(data) || typeof data.display !== "string") {
    return undefined;
  }

  // OMP 17.4's compiled legacy shim can leave getMarkdownTheme's module-global
  // theme uninitialized. Preserve the original renderer first, then use the
  // actual renderer theme for a plain-text card only for that host defect.
  const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
  box.addChild(new Text(theme.bold(REWRITE_HEADING), 0, 0));
  box.addChild(new Text(data.display, 0, 1));
  return box;
}

function isUninitializedOmpMarkdownTheme(error: unknown): boolean {
  return error instanceof TypeError && error.message.includes("theme.getColorMode");
}

function adaptOmpContext(context: OmpContext): ExtensionContext {
  const mode = Reflect.has(context, "mode") ? context.mode : "tui";
  const signal = Reflect.has(context, "signal") ? context.signal : undefined;
  const scopedModels = Array.isArray(context.scopedModels) ? context.scopedModels : [];
  const isProjectTrusted =
    typeof context.isProjectTrusted === "function" ? context.isProjectTrusted.bind(context) : () => true;
  const waitForIdle = typeof context.waitForIdle === "function" ? context.waitForIdle.bind(context) : undefined;

  return {
    ui: context.ui,
    cwd: context.cwd,
    mode,
    modelRegistry: adaptOmpModelRegistry(context.modelRegistry),
    scopedModels,
    sessionManager: adaptOmpSessionManager(context.sessionManager),
    signal,
    isProjectTrusted,
    waitForIdle,
  } as unknown as ExtensionContext;
}

function adaptOmpModelRegistry(registry: OmpModelRegistry): PiModelRegistry {
  const getProvider =
    typeof registry.getProvider === "function"
      ? registry.getProvider.bind(registry)
      : () => {
          // OMP 17.4.0 remaps this legacy compat import to its native pi-ai shim.
          // Plain Node uses the locked Earendil compatibility dispatcher.
          return { streamSimple };
        };

  return {
    find: registry.find.bind(registry),
    hasConfiguredAuth: registry.hasConfiguredAuth.bind(registry),
    getAvailable: registry.getAvailable.bind(registry),
    getApiKeyAndHeaders: registry.getApiKeyAndHeaders.bind(registry),
    getProvider,
  } as PiModelRegistry;
}

function adaptOmpSessionManager(sessionManager: OmpSessionManager): PiSessionManager {
  const getBranch = sessionManager.getBranch.bind(sessionManager);

  return {
    getBranch: () => normalizeOmpBranch(getBranch()),
  } as PiSessionManager;
}

function registerOmpContextIsolation(runtime: OmpRuntimeApi): void {
  const on = runtime.on.bind(runtime);
  on("context", (event) => filterOmpContextMessages(event));
}

function filterOmpContextMessages(event: unknown): { messages: unknown[] } | undefined {
  if (!isRecord(event) || !Array.isArray(event.messages)) {
    return undefined;
  }

  const messages = event.messages.filter((message) => !isSlyeContextMessage(message));
  return messages.length === event.messages.length ? undefined : { messages };
}

function normalizeOmpBranch(branch: unknown): unknown {
  if (!Array.isArray(branch)) {
    return branch;
  }

  return branch.map((entry) => {
    if (!isRecord(entry) || entry.type !== "custom_message" || entry.customType !== REWRITE_ENTRY_TYPE) {
      return entry;
    }

    const { details, ...rest } = entry;
    return {
      ...rest,
      type: "custom",
      data: details,
    };
  });
}

function isSlyeContextMessage(message: unknown): boolean {
  return isRecord(message) && message.role === "custom" && message.customType === REWRITE_ENTRY_TYPE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
