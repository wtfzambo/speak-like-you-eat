import type { AgentEndEvent, SessionEntry, SessionMessageEntry } from "@earendil-works/pi-coding-agent";

const MINIMUM_PROSE_CHARACTERS = 200;
export const MAXIMUM_CONTEXT_CHARACTERS = 8_000;

export type ContextMessage = {
  role: "user" | "assistant";
  text: string;
};

export type RewriteRequest = {
  target: string;
  context: ContextMessage[];
};

export type PreparedRewriteRequest = {
  entryId: string;
  request: RewriteRequest;
};

type AgentMessage = AgentEndEvent["messages"][number];
type AssistantMessage = Extract<AgentMessage, { role: "assistant" }>;

export function prepareRewriteRequest(
  messages: readonly AgentMessage[],
  branch: readonly SessionEntry[],
): PreparedRewriteRequest | undefined {
  const target = findEligibleTarget(messages);
  if (target === undefined) {
    return undefined;
  }

  const targetEntry = findTargetEntry(branch, target);
  if (targetEntry === undefined) {
    return undefined;
  }

  return prepareRequest(branch, targetEntry, target);
}

export function prepareManualRewriteRequest(branch: readonly SessionEntry[]): PreparedRewriteRequest | undefined {
  const targetEntry = findLatestConversationalEntry(branch);
  if (targetEntry === undefined) {
    return undefined;
  }

  const target = targetEntry.message;
  if (target.role !== "assistant" || target.stopReason !== "stop" || hasToolCall(target)) {
    return undefined;
  }

  const targetText = joinTextBlocks(target.content);
  if (stripFencedCodeBlocks(targetText).trim() === "") {
    return undefined;
  }

  return prepareRequest(branch, targetEntry, target);
}

export function stripFencedCodeBlocks(text: string): string {
  const lines = text.split("\n");
  const proseLines: string[] = [];
  let openFence: { marker: "`" | "~"; length: number } | undefined;

  for (const line of lines) {
    if (openFence !== undefined) {
      if (isClosingFence(line, openFence)) {
        openFence = undefined;
      }
      continue;
    }

    const fence = findOpeningFence(line);
    if (fence !== undefined) {
      openFence = fence;
      continue;
    }

    proseLines.push(line);
  }

  return proseLines.join("\n");
}

export function serializeContext(context: readonly ContextMessage[]): string {
  return context.map((message) => `${message.role}:\n${message.text}`).join("\n\n");
}

function findEligibleTarget(messages: readonly AgentMessage[]): AssistantMessage | undefined {
  const target = findFinalAssistantMessage(messages);
  if (target === undefined || target.stopReason !== "stop" || hasToolCall(target)) {
    return undefined;
  }

  const textBlocks = extractTextBlocks(target.content);
  if (!textBlocks.some((text) => text.trim() !== "")) {
    return undefined;
  }

  const targetText = textBlocks.join("\n\n");
  const proseLength = stripFencedCodeBlocks(targetText).replaceAll(/\s/g, "").length;
  return proseLength >= MINIMUM_PROSE_CHARACTERS ? target : undefined;
}

function findFinalAssistantMessage(messages: readonly AgentMessage[]): AssistantMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return message;
    }
  }

  return undefined;
}

function findTargetEntry(branch: readonly SessionEntry[], target: AssistantMessage): SessionMessageEntry | undefined {
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry?.type !== "message" || entry.message.role !== "assistant") {
      continue;
    }
    if (entry.message === target || messagesMatch(entry.message, target)) {
      return entry;
    }
  }

  return undefined;
}

function findLatestConversationalEntry(branch: readonly SessionEntry[]): SessionMessageEntry | undefined {
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry?.type !== "message") {
      continue;
    }
    if (entry.message.role === "user" || entry.message.role === "assistant") {
      return entry;
    }
  }

  return undefined;
}

function prepareRequest(
  branch: readonly SessionEntry[],
  targetEntry: SessionMessageEntry,
  target: AssistantMessage,
): PreparedRewriteRequest {
  return {
    entryId: targetEntry.id,
    request: {
      target: joinTextBlocks(target.content),
      context: buildPriorContext(branch, targetEntry.id),
    },
  };
}

function messagesMatch(left: AssistantMessage, right: AssistantMessage): boolean {
  return (
    left.stopReason === right.stopReason &&
    left.timestamp === right.timestamp &&
    joinTextBlocks(left.content) === joinTextBlocks(right.content) &&
    hasToolCall(left) === hasToolCall(right)
  );
}

function buildPriorContext(branch: readonly SessionEntry[], targetEntryId: string): ContextMessage[] {
  const targetIndex = branch.findIndex((entry) => entry.id === targetEntryId);
  if (targetIndex === -1) {
    return [];
  }

  const entriesBeforeTarget = branch.slice(0, targetIndex);
  const userIndexes = findUserMessageIndexes(entriesBeforeTarget);
  if (userIndexes.length === 0) {
    return [];
  }

  const firstTurnIndex = userIndexes[Math.max(0, userIndexes.length - 2)];
  // The non-empty check above makes this a type-safety fallback.
  if (firstTurnIndex === undefined) {
    return [];
  }

  const context: ContextMessage[] = [];
  for (const entry of entriesBeforeTarget.slice(firstTurnIndex)) {
    const message = getContextMessage(entry);
    if (message !== undefined) {
      context.push(message);
    }
  }

  return limitContext(context);
}

function findUserMessageIndexes(entries: readonly SessionEntry[]): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry?.type === "message" && entry.message.role === "user") {
      indexes.push(index);
    }
  }
  return indexes;
}

function getContextMessage(entry: SessionEntry): ContextMessage | undefined {
  if (entry.type !== "message") {
    return undefined;
  }
  if (entry.message.role !== "user" && entry.message.role !== "assistant") {
    return undefined;
  }

  const text = stripFencedCodeBlocks(joinTextBlocks(entry.message.content)).trim();
  if (text === "") {
    return undefined;
  }

  return { role: entry.message.role, text };
}

function limitContext(context: ContextMessage[]): ContextMessage[] {
  const limited = [...context];
  while (limited.length > 1 && serializeContext(limited).length > MAXIMUM_CONTEXT_CHARACTERS) {
    limited.shift();
  }

  const newest = limited[0];
  if (newest === undefined || serializeContext(limited).length <= MAXIMUM_CONTEXT_CHARACTERS) {
    return limited;
  }

  const roleLabel = `${newest.role}:\n`;
  const textLength = MAXIMUM_CONTEXT_CHARACTERS - roleLabel.length;
  return [{ role: newest.role, text: newest.text.slice(-textLength) }];
}

function joinTextBlocks(content: unknown): string {
  return extractTextBlocks(content).join("\n\n");
}

function extractTextBlocks(content: unknown): string[] {
  if (typeof content === "string") {
    return [content];
  }
  if (!Array.isArray(content)) {
    return [];
  }

  const textBlocks: string[] = [];
  for (const block of content) {
    if (isTextBlock(block)) {
      textBlocks.push(block.text);
    }
  }
  return textBlocks;
}

function hasToolCall(message: AssistantMessage): boolean {
  return message.content.some((block) => isToolCallBlock(block));
}

function isTextBlock(block: unknown): block is { type: "text"; text: string } {
  return (
    typeof block === "object" &&
    block !== null &&
    "type" in block &&
    block.type === "text" &&
    "text" in block &&
    typeof block.text === "string"
  );
}

function isToolCallBlock(block: unknown): block is { type: "toolCall" } {
  return typeof block === "object" && block !== null && "type" in block && block.type === "toolCall";
}

function findOpeningFence(line: string): { marker: "`" | "~"; length: number } | undefined {
  const match = /^\s*(`{3,}|~{3,})/.exec(line);
  if (match?.[1] === undefined) {
    return undefined;
  }

  const marker = match[1][0] as "`" | "~";
  return { marker, length: match[1].length };
}

function isClosingFence(line: string, openFence: { marker: "`" | "~"; length: number }): boolean {
  const escapedMarker = openFence.marker === "`" ? "`" : "~";
  return new RegExp(`^\\s*${escapedMarker}{${openFence.length},}\\s*$`).test(line);
}
