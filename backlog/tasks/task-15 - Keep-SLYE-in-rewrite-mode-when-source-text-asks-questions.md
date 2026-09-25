---
id: TASK-15
title: Keep SLYE in rewrite mode when source text asks questions
status: Done
assignee:
  - '@zambo'
created_date: '2026-09-25 18:01'
updated_date: '2026-09-25 19:56'
labels: []
dependencies: []
type: bug
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
SLYE intermittently answers the assistant source rather than rewriting it. In the supplied screenshot, a progress report ending in “Procedo così?” became an affirmative authorization to proceed, losing the report. User approved targeted live probes against current Ollama Cloud and GPT models, explicitly excluding language handling (TASK-14) and Claude. Do not change the user model configuration without agreement.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Question-ending source responses remain rewritten source text, preserving speaker perspective and substantive claims instead of receiving an answer or authorization
- [x] #2 Focused live evidence compares the current request with the proposed correction on available Ollama Cloud and GPT candidates, with explicit sample-size limitations
- [x] #3 Regression tests protect the rewrite-only request contract and existing request isolation
- [x] #4 Current specification documents the corrected rewrite behavior; checks pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Completed: inspect request framing and available local models; leave TASK-14 untouched. 2. Completed: 24 sequential live calls, three models x baseline/candidate x four cases, in benchmark/.work/task-15/. Original answering failure did not reproduce; baseline GPT-OSS dropped a question once, candidate retained all tested questions and control code. 3. Promote the exact tested candidate: prepend three editor/speaker/question-preservation instructions to REWRITE_SYSTEM_PROMPT and append the tested rewrite-only reminder after the complete source in the existing single user message. No validators, retry calls, source delimiter changes, configuration or model changes. 4. Update exact payload expectations in test/model-rewrite.test.ts and test/display.test.ts; add a question-ending/source-instruction regression and an affirmative/code control regression to protect source preservation and request framing. Update doc-1 through CLI; historical benchmark snapshots stay untouched. 5. Independently inspect diff, re-run npm run check, review with taste/spec and documentation specialists. Report nonreproduction and installed npm package versus repository distinction; no release or installation change.

Test dependency correction: test/benchmark.test.ts currently equates frozen historical user messages with production. Preserve historical builders/manifests unchanged; update only that assertion block to keep historical messages equal to one another and their original Context/Target format, and expect production to add the exact tested final reminder.

Implementation exposed a real coupling: benchmark/prompt-variants.ts delegates user-message assembly to production, so the trailing instruction changes historical fingerprints. Correct the plan by isolating the original Context/Target serialization inside the historical benchmark builders (shared private helper for both phases), preserving their system prompt constants and committed manifests byte-for-byte. This narrow dependency fix is required to preserve, not revise, the historical benchmark.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-25: 24 sequential live calls compared ollama-cloud/deepseek-v4.1-flash off, ollama-cloud/gpt-oss:120b low, and openai-codex/gpt-6-luna off, baseline versus candidate across four cases. All normal-stop. Original answer-instead-of-rewrite failure did not reproduce; baseline GPT-OSS omitted the final question once, while all nine candidate question outputs retained it. All six controls retained affirmative source content and exact fenced code. Mean baseline/candidate latency ms: DeepSeek 846/841, GPT-OSS 990/900, Luna 5069/4724. Ignored local evidence: benchmark/.work/task-15/{fixtures-and-payloads.json,models.json,results/,manual-review.md}. One sample per cell, synthetic/empty context, and repository prompt rather than installed npm prompt (installed lacks decorative-negation line); not an exact installed-prompt reproduction or universal guarantee.

Orchestrator and reviewers independently verified output evidence, production payload equality with saved candidates, both entry paths converging on rewriteTarget, and unchanged historical manifests/fingerprints. npm run check passes 94/94 plus formatter/linter/typecheck; git diff --check passes. Taste, spec, and docs reviews had no findings. Final whole-change review approved code composition, requiring explicit TASK-15 staging (exclude pre-existing TASK-14) and refreshed continuity/commit notes; these are addressed in commit preparation and handoff. User explicitly approved commit and push.

Known minor edge retained: an unterminated source code fence can encompass the appended reminder. No source mutation or fence-repair heuristic was added in this focused change. The optional pre-existing doc-4 historical-scope wording was left unchanged because its operative historical-only caveat remains correct. AC1 is verified for nine sampled candidate question cases, not a deterministic guarantee. No release, npm installation, or model/configuration change.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Hardened the rewrite request with the exact tested editor/same-speaker/question-preservation instructions and a final task reminder. Added two contract regressions and isolated historical benchmark serialization while preserving old prompts and manifest fingerprints. Updated doc-1/doc-3. The 24-call probe did not reproduce the original answering failure; all candidate questions and control code were retained. Checks pass 94/94; taste/spec/docs reviews clean and final code review approved with staging/handoff corrections addressed. User approved commit and push; installed npm package and configuration remain unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
