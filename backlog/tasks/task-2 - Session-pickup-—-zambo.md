---
id: TASK-2
title: Session pickup — zambo
status: To Do
assignee:
  - '@zambo'
created_date: '2026-08-13 23:04'
updated_date: '2026-09-25 19:57'
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
2026-09-25. Branch main: functional commit 0aeca28 (fix: keep SLYE in rewrite mode for source questions) is committed and successfully pushed to origin/main. This continuity-only commit follows it. TASK-15 is Done: editor/same-speaker/question-preservation prompt instructions, final rewrite reminder, request-contract tests, frozen historical benchmark framing, and doc-1/doc-3 updates. No pending implementation changes. The only unrelated local file is the pre-existing untracked TASK-14, deliberately excluded from the commits; do not delete or include it accidentally. The installed global npm:speak-like-you-eat package remains unchanged.

WHAT'S NEXT
1. Commit and push were explicitly approved and executed; there is no outstanding review for TASK-15. Taste, spec, docs, and final whole-change reviews are complete. The final review staging/continuity requirements were addressed; source changes were not required.
2. A release or local installation test is a separate user decision. Do not claim the installed npm package includes this correction. The push can update the release-please PR; it is not itself an npm release.
3. If answering recurs, capture the exact target, context, selected model, and installed version. The 24-call probe did not reproduce the screenshot authorization failure: this is prompt-level hardening, not deterministic validation. One known minor edge remains: an unterminated source code fence can encompass the appended reminder.

WAITING ON / GATED BY
As of 2026-09-25, applying the correction to the globally loaded npm package requires an agreed installation/release step. TASK-14 language handling remains explicitly outside this request. No model or configuration was changed.

VERIFY
Run `git status -sb` (expect synchronized main, no tracked modifications, only unrelated untracked TASK-14), `git log --oneline -3` (continuity commit above 0aeca28), `backlog task view TASK-15 --plain`, and `npm run check` (94 tests plus static checks). The functional commit preserves both historical benchmark manifest fingerprints. Ignored benchmark/.work/task-15/ holds the 24-call evidence and saved exact candidate payloads; do not rerun run-probe.mjs after promotion because its baseline imports the now-changed production builder. See TASK-15 for model IDs, timings, limits, and review results.
<!-- SECTION:DESCRIPTION:END -->
