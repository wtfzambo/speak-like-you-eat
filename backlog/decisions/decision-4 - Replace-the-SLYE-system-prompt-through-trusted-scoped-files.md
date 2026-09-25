---
id: decision-4
title: Replace the SLYE system prompt through trusted scoped files
date: '2026-09-25 20:30'
status: accepted
---
## Context

[GitHub issue #6](https://github.com/wtfzambo/speak-like-you-eat/issues/6) requests customization of the hardcoded system prompt. The operator chose full replacement rather than additional instructions, so users can control the prompt without conflicting built-in style rules. Implementation and verification are tracked in [TASK-16](../tasks/task-16%20-%20Support-full-system-prompt-replacement-from-slye-prompt.md.md).

## Decision

Use the fixed filename `slye-prompt.md`, with a trusted project file taking precedence over the global agent-directory file. Keep prompt selection independent of `slye.json` scope so style and model configuration need not share a scope. Untrusted project files are not read.

Pass nonblank file text verbatim as the entire system prompt. Read it per rewrite attempt rather than caching it, so editing requires no restart. Only absent files permit fallback; blank or unreadable selected files block the rewrite and warn instead of silently applying unintended instructions. Keep the existing built-in prompt when no applicable file exists.

Replace system instructions only: retain the source user-message framing and final rewrite-only reminder, target selection, provider/model policy, and display-only persistence. Add no prompt editor, command, template engine, or configuration field. Current behavior belongs in the [specification](../docs/specs/doc-1%20-%20SLYE-MVP-specification.md#custom-system-prompt); setup belongs in the [runbook](../docs/runbooks/doc-6%20-%20Customize-the-SLYE-system-prompt.md).

## Consequences

Users own the rules they replace, including language preservation and rewrite-only system instructions; built-in prompt benchmark results do not establish custom-prompt quality. File errors leave the original response intact and permit a later manual retry. Existing companion cards remain immutable. The extra file reads are accepted in exchange for immediate, predictable changes without additional state.
