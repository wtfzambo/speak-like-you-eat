import assert from "node:assert/strict";
import test from "node:test";
import type { AgentEndEvent, SessionEntry } from "@earendil-works/pi-coding-agent";
import {
  MAXIMUM_CONTEXT_CHARACTERS,
  prepareManualRewriteRequest,
  prepareRewriteRequest,
  serializeContext,
  stripFencedCodeBlocks,
} from "../src/rewrite.ts";

type AgentMessage = AgentEndEvent["messages"][number];

test("prepares the complete eligible final response at the 200-character prose boundary", () => {
  const firstText = "a".repeat(100);
  const secondText = "b".repeat(100);
  const target = assistant([text(firstText), text(secondText)]);
  const result = prepareRewriteRequest(
    [assistant([text("intermediate")]), target],
    [entry("user", user("Explain this")), entry("assistant", target)],
  );

  assert.deepEqual(result?.request.target, `${firstText}\n\n${secondText}`);
  assert.equal(result?.entryId, "assistant");
});

test("rejects a final response with 199 non-whitespace prose characters", () => {
  const target = assistant([text("a".repeat(199))]);

  assert.equal(prepareRewriteRequest([target], [entry("assistant", target)]), undefined);
});

test("prepares a one-character prose manual target with code", () => {
  const code = "```ts\nconst answer = true;\n```";
  const target = assistant([text(code), text("x")]);
  const result = prepareManualRewriteRequest([entry("user", user("Explain this")), entry("assistant", target)]);

  assert.deepEqual(result, {
    entryId: "assistant",
    request: {
      target: `${code}\n\nx`,
      context: [{ role: "user", text: "Explain this" }],
    },
  });
});

test("rejects blank, code-only, unfinished, non-stop, and tool-call manual targets", () => {
  const cases: AgentMessage[] = [
    assistant([text("   ")]),
    assistant([text("```ts\nconst ignored = true;\n```")]),
    assistant([text("prose")], "length"),
    assistant([text("prose")], "error"),
    assistant([text("prose")], "aborted"),
    assistant([text("prose")], "toolUse"),
    assistant([text("prose"), { type: "toolCall", id: "tool-1", name: "read", arguments: {} }]),
  ];

  for (const target of cases) {
    assert.equal(prepareManualRewriteRequest([entry("assistant", target)]), undefined);
  }
});

test("does not manually rewrite an older assistant response when a user message follows it", () => {
  const target = assistant([text("Completed response")]);

  assert.equal(
    prepareManualRewriteRequest([entry("assistant", target), entry("user", user("A newer request"))]),
    undefined,
  );
});

test("ignores trailing non-conversational entries when selecting a manual target", () => {
  const target = assistant([text("Completed response")]);
  const branch: SessionEntry[] = [
    entry("assistant", target),
    entry("tool-result", toolResult()),
    {
      type: "thinking_level_change",
      id: "thinking",
      parentId: "tool-result",
      timestamp: "now",
      thinkingLevel: "high",
    },
    {
      type: "model_change",
      id: "model",
      parentId: "thinking",
      timestamp: "now",
      provider: "provider",
      modelId: "model",
    },
    {
      type: "custom",
      id: "custom",
      parentId: "model",
      timestamp: "now",
      customType: "slye.rewrite",
    },
  ];

  assert.equal(prepareManualRewriteRequest(branch)?.entryId, "assistant");
});

test("skips short, blank, code-only, unfinished, non-stop, and tool-call final responses", () => {
  const enoughText = "prose ".repeat(40);
  const cases: AgentMessage[] = [
    assistant([text("short")]),
    assistant([text("   ")]),
    assistant([text(`\`\`\`ts\n${enoughText}\n\`\`\``)]),
    assistant([text(`before\n\`\`\`\n${enoughText}`)]),
    assistant([text(enoughText)], "length"),
    assistant([text(enoughText)], "error"),
    assistant([text(enoughText)], "aborted"),
    assistant([text(enoughText)], "toolUse"),
    assistant([text(enoughText), { type: "toolCall", id: "tool-1", name: "read", arguments: {} }]),
  ];

  for (const target of cases) {
    assert.equal(prepareRewriteRequest([target], [entry("assistant", target)]), undefined);
  }
});

test("strips only compatible fenced blocks and leaves target Markdown untouched", () => {
  const source = [
    "opening prose",
    "````typescript",
    "const ignored = true;",
    "```",
    "still ignored because the fence is too short",
    "````",
    "middle prose",
    "~~~",
    "also ignored",
    "~~~~",
    "closing prose",
  ].join("\n");

  assert.equal(stripFencedCodeBlocks(source), "opening prose\nmiddle prose\nclosing prose");
  assert.equal(stripFencedCodeBlocks("start\n~~~\nignored"), "start");
  assert.equal(stripFencedCodeBlocks("text\n```\nignored\n~~~\nstill ignored"), "text");

  const target = assistant([text(source), text("x".repeat(200))]);
  const result = prepareRewriteRequest([target], [entry("assistant", target)]);
  assert.equal(result?.request.target, `${source}\n\n${"x".repeat(200)}`);
});

test("uses only the last two user-led turns and excludes non-conversational content", () => {
  const target = assistant([text("final ".repeat(40))]);
  const intermediate = assistant([
    text("intermediate prose\n```\nconst hidden = true;\n```\nthat remains"),
    { type: "thinking", thinking: "not context" },
    { type: "toolCall", id: "tool-1", name: "read", arguments: {} },
  ]);
  const branch: SessionEntry[] = [
    entry("old-user", user("older user")),
    entry("old-assistant", assistant([text("older answer")])),
    entry("previous-user", user([text("previous user\n~~~\nhidden\n~~~\nkept")])),
    entry("tool-result", toolResult()),
    {
      type: "custom",
      id: "custom",
      parentId: "tool-result",
      timestamp: "now",
      customType: "other",
      data: { text: "exclude" },
    },
    entry("previous-assistant", assistant([text("previous answer")])),
    entry("current-user", user("current user")),
    entry("intermediate", intermediate),
    entry("target", target),
  ];

  const result = prepareRewriteRequest([intermediate, target], branch);

  assert.deepEqual(result?.request.context, [
    { role: "user", text: "previous user\nkept" },
    { role: "assistant", text: "previous answer" },
    { role: "user", text: "current user" },
    { role: "assistant", text: "intermediate prose\nthat remains" },
  ]);
});

test("context serialization stays within 8,000 characters by retaining the newest labelled suffix", () => {
  const target = assistant([text("final ".repeat(40))]);
  const largeIntermediateText = `${"old".repeat(10)}${"new".repeat(3_000)}`;
  const intermediate = assistant([text(largeIntermediateText)]);
  const branch = [
    entry("user", user("old user".repeat(1_000))),
    entry("assistant", intermediate),
    entry("target", target),
  ];
  const automaticResult = prepareRewriteRequest([intermediate, target], branch);
  const manualResult = prepareManualRewriteRequest(branch);

  assert.equal(automaticResult?.request.context.length, 1);
  assert.equal(automaticResult?.request.context[0]?.role, "assistant");
  assert.equal(serializeContext(automaticResult?.request.context ?? []).length, MAXIMUM_CONTEXT_CHARACTERS);
  assert.match(automaticResult?.request.context[0]?.text ?? "", /newnewnew$/);
  assert.deepEqual(manualResult?.request.context, automaticResult?.request.context);
});

function text(value: string): { type: "text"; text: string } {
  return { type: "text", text: value };
}

function user(content: unknown): AgentMessage {
  return { role: "user", content, timestamp: 1 } as AgentMessage;
}

function assistant(content: unknown, stopReason: string = "stop"): AgentMessage {
  return {
    role: "assistant",
    content,
    stopReason,
    timestamp: 2,
  } as AgentMessage;
}

function toolResult(): AgentMessage {
  return { role: "toolResult", content: [text("exclude")], timestamp: 3 } as AgentMessage;
}

function entry(id: string, message: AgentMessage): SessionEntry {
  return { type: "message", id, parentId: null, timestamp: "now", message } as SessionEntry;
}
