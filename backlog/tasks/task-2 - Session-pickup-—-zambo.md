---
id: TASK-2
title: Session pickup — zambo
status: To Do
assignee:
  - '@zambo'
created_date: '2026-08-13 23:04'
updated_date: '2026-08-30 10:43'
labels:
  - continuity
  - handoff
dependencies: []
priority: high
type: task
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
WHERE WE LEFT OFF
2026-08-30. `main` is at the HEAD commit containing TASK-13, "Strip empty affirmation/negation contrasts during rewriting", and is synchronized with `origin/main`; the working tree is clean. SLYE production rewrites now instruct the selected model to delete decorative "X, not Y" and "not A, but B" constructions, while preserving negations that warn about a plausible concrete mistake. The rule is implemented in `src/model-rewrite.ts`, asserted in `test/model-rewrite.test.ts`, and documented in `doc-1`. A throwaway A/B probe against `ollama-cloud/deepseek-v4-flash:0731` showed the initial softer wording was ineffective; the committed wording removed padded contrasts while retaining operational warnings. TASK-13 is Done. `npm run check` passed with 92/92 tests. Benchmark prompt snapshots remain unchanged. SLYE 1.1.0 remains the latest published release.

WHAT'S NEXT
1. No action is required for TASK-13. Let normal use reveal whether other models follow the prompt consistently.
2. If evidence shows over-deletion or missed decorative contrasts, reopen TASK-13 with the concrete input, model, and output; avoid building a large benchmark unless repeated failures justify it.
3. TASK-7 remains separate and To Do with its paused SLYE Markdown product questions.

WAITING ON / GATED BY
As of 2026-08-30, nothing is blocked. No release of this post-1.1.0 change has been requested.

VERIFY
Run `git status -sb` and `git log --oneline -5`; expect clean synchronized `main` with the TASK-13 feature commit at HEAD. Run `backlog task view TASK-13 --plain`; expect Done with all three acceptance criteria checked and the A/B result recorded. Run `npm run check`; expect formatter, linter, typecheck, and 92 tests to pass. Inspect `benchmark/prompt-variants.ts`; it should remain unchanged by TASK-13.
<!-- SECTION:DESCRIPTION:END -->
