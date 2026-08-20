---
id: TASK-11
title: Add on-demand SLYE rewrites with manual-first setup
status: Done
assignee:
  - '@zambo'
created_date: '2026-08-19 23:30'
updated_date: '2026-08-20 18:15'
labels: []
dependencies: []
documentation:
  - backlog/docs/specs/doc-1 - SLYE-MVP-specification.md
  - backlog/docs/runbooks/doc-2 - SLYE-sandbox-manual-checks.md
priority: medium
type: feature
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Let users keep automatic SLYE rewriting off and invoke one rewrite explicitly for the latest completed assistant response. A Reddit user requested a manual trigger and disabled-by-default setup. Existing automatic users must keep their current behavior, while first-time model configuration becomes manual-only until the user explicitly runs `/slye on`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `/slye` without arguments rewrites the latest completed assistant response once in TUI mode, bypassing only the 200-character automatic threshold while retaining normal-stop, nonblank prose, no-tool-call, isolation, language, context, cancellation, timeout, original-preservation, and fail-open contracts
- [x] #2 A manual invocation uses a configured usable model even when automatic rewriting is off; if no usable model is selected, it opens the existing picker, saves the chosen model and scope with automatic rewriting off, and immediately performs the requested rewrite without altering malformed configuration
- [x] #3 `/slye model` preserves an existing automatic on/off state and defaults a first valid configuration to manual-only; `/slye on` enables automatic rewriting and selects a model when needed; `/slye off` disables only automatic rewriting while leaving `/slye` available
- [x] #4 At startup, a missing model explains the difference between `/slye model` and `/slye on`; configured manual mode stays quiet, malformed configuration still warns, and an unusable model warns only when automatic rewriting is enabled
- [x] #5 Each target has at most one persistent SLYE companion across repeated commands and resumed sessions; failed or cancelled attempts remain retryable and concurrent automatic/manual requests cannot create duplicate calls or cards
- [x] #6 Automated tests and the sandbox runbook cover first-time manual setup, short manual targets, model replacement, mode preservation, startup messages, retries, duplicate prevention, and unchanged automatic behavior without requiring a provider benchmark
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Start a local `task-11-manual-rewrites` branch from current `main`, preserve the 1.0.1 baseline, and make no provider calls, benchmark changes, version changes, release, push, or merge.
2. In `src/rewrite.ts`, add a manual request-preparation path that requires the latest conversational entry to be a normal completed assistant response, bypasses only the automatic 200-character threshold, rejects blank/code-only/tool-call/non-stop targets, and reuses the existing target serialization and bounded two-turn context. Cover the manual and unchanged automatic boundaries in `test/rewrite.test.ts`.
3. In `src/index.ts`, make model selection save an explicit automatic-enabled state and return the selected usable model after a successful atomic save. `/slye model` preserves a valid existing state and otherwise defaults to manual-only; `/slye on` continues to enable or select a model; `/slye off` retains the model and disables only automatic rewriting. Align startup and save notifications with the approved missing-model/manual/automatic matrix, with coverage in `test/onboarding.test.ts`.
4. Centralize automatic and manual execution around one rewrite operation while keeping their UI edges explicit: automatic events retain the current working message and signal; empty `/slye` waits for Pi to become idle, validates the target before configuration, uses a disabled saved model or opens the existing picker and saves disabled, then runs inside a cancellable `BorderedLoader` using its signal. Invalid configuration remains untouched and all existing isolation, minimum-thinking, timeout, language, original-preservation, and fail-open behavior stays unchanged.
5. Replace the one-shot runtime processed set with simple target claims: an in-flight set blocks concurrent calls, an automatic-attempt set suppresses duplicate `agent_end` retries, and successful target IDs prevent duplicate cards. Persist the target ID on new `slye.rewrite` entries; on resumed sessions, recognize both explicit new IDs and legacy `{display}` cards by their nearest preceding assistant entry. Release claims after cancellation, failure, or append failure so manual retry remains possible. Test repeated commands, concurrency, automatic failure followed by manual retry, append failure, resume with new and legacy cards, rendering compatibility, picker cancellation, and manual Escape cancellation in `test/display.test.ts`.
6. Update `README.md`, authoritative doc-1, and sandbox runbook doc-2 for manual-first setup, `/slye`, command distinctions, eligibility, retries, and no-duplicate behavior. Add an accepted decision through Backlog's supported decision workflow for manual-first configuration and per-target companion identity; do not document implementation-only machinery as product truth.
7. Run focused tests after each slice, run `npm run check`, both historical no-call benchmark dry-runs, and `npm pack --dry-run --json`, then trace first-use manual, configured manual, automatic, cancellation/retry, and resumed legacy-card paths. Run taste/spec review before each non-trivial commit, docs review because authoritative behavior changes, and one final branch review. Keep the package at exactly 12 files and leave all benchmark evidence immutable.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design agreed with the operator on 2026-08-19 after a four-round grill. Pi API research confirmed that idle command contexts normally have no abort signal, so manual completion must use a cancellable `BorderedLoader`; `ctx.waitForIdle()` and persistent display-only custom entries support target selection and resume-safe deduplication. No provider benchmark is required because the rewrite prompt and model contract do not change.

Implemented on local branch `task-11-manual-rewrites` in commits `58b2349`, `6877071`, `ca1e660`, `2ea8814`, and `80eb622`. Manual target preparation, manual-first config semantics, cancellable one-shot execution, target-identified persistent deduplication, retry behavior, documentation, decision-3, and first-use revalidation coverage are complete. Final verification on 2026-08-20: `npm run check` passed 92 tests; historical no-call dry-runs retained fingerprints `80d7d401fe9862d3d558efc4ba8b674014dd3e7e975f02d77cc3b37c30fbd759` and `59fc67e920727f25b40b1fd874cda6b51aff9f98426ae09af27275a4fda96728`; historical manifest hashes remained unchanged; package dry-run contained exactly 12 files; a temporary Pi project listed the local package. No provider call, benchmark mutation, version bump, release, push, or merge occurred. Per-commit taste/spec reviews and the docs review found no remaining blocker. The pinned core taste reviewer stalled and was visibly replaced under the fallback policy with `openai-codex/gpt-5.6-sol`; its claim-cleanup must-fix was resolved. The pinned Opus final reviewer failed with provider 429 and the same explicit fallback model returned `merge`; its sole test-coverage minor was then added in `80eb622`.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added `/slye` on-demand rewriting with manual-first model setup while preserving existing automatic users and the isolated rewrite contract. Manual requests validate and revalidate the latest completed target, select and save a disabled model when needed, use a cancellable loader, persist one companion identity per target, suppress duplicates across resume and legacy cards, and allow manual retry after cancellation or failure. Updated README, specification, sandbox procedure, and accepted decision-3. Verified with 92 tests, Biome, TypeScript, unchanged historical dry-run fingerprints/manifests, a 12-file package dry-run, and a no-call temporary Pi package smoke.
<!-- SECTION:FINAL_SUMMARY:END -->
