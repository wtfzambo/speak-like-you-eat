---
id: TASK-16
title: Support full system prompt replacement from slye-prompt.md
status: Done
assignee:
  - '@zambo'
created_date: '2026-09-25 20:30'
updated_date: '2026-09-25 21:56'
labels: []
dependencies: []
references:
  - 'https://github.com/wtfzambo/speak-like-you-eat/issues/6'
type: feature
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub issue #6 asks to customize the hardcoded SLYE system prompt from a file. The user approved full system-prompt replacement and the fixed filename slye-prompt.md, globally and with trusted-project override. Preserve existing rewrite targeting, isolation, and model configuration; no prompt editor, commands, styles, or OMP integration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Without a prompt file, automatic and manual rewrites use the unchanged built-in system prompt and existing user-message framing
- [x] #2 A nonblank UTF-8 slye-prompt.md from the trusted project .pi directory overrides the global agent-directory file; untrusted project files are never read; selection is independent of slye.json scope
- [x] #3 The selected file replaces the system prompt verbatim, without appending built-in rules, and is reread for every rewrite attempt
- [x] #4 An existing blank or unreadable selected prompt blocks fallback and model dispatch, warns, and leaves the original response intact and available for a later manual retry
- [x] #5 Tests cover precedence, trust, invalid/missing files, both rewrite entry paths and reload; package checks and authoritative documentation reflect the feature
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add src/prompt.ts with a fixed slye-prompt.md filename and a small async resolver: trusted project first, then global agent directory, then missing/built-in. Preserve nonblank file text verbatim; only ENOENT permits fallback, blank/read errors produce an invalid result with its path. No caching, discovery, or JSON config fields.
2. Add an optional systemPrompt parameter to buildRewriteContext and completeRewrite; undefined selects the existing built-in prompt. Keep the existing one-user-message content and final rewrite reminder unchanged; explicit custom text fully replaces system instructions.
3. In the shared index.ts rewriteTarget path resolve the file before provider dispatch using getAgentDir(), ctx.cwd/CONFIG_DIR_NAME and ctx.isProjectTrusted(). Invalid results fail without dispatch or append and use the existing once-per-session processing warning, extended with a path-specific message. Preserve silent cancellation and manual retry behavior. Both manual and automatic paths already converge here.
4. Test the resolver with real temporary files for missing/fallback/precedence/trust/blank/read error/verbatim text; test request-builder substitution and integrated automatic/manual dispatch, file edits between attempts, invalid blocking/fallback refusal, warning and successful manual retry after repair. Update packed-file allowlist for src/prompt.ts; preserve historical benchmark payloads/manifests.
5. Orchestrator updates authoritative doc-1, adds a short README link and a runbook with file setup/example/reload/failure/removal steps, and records the full-replacement/trusted-file decision via Backlog CLI. Run npm run check, inspect diff, and specialist reviews. No live inference, issue closure/comments, commit, push, release, or user config changes without a further request.

Public documentation packaging: include the new README-linked doc-6 runbook in package.json.files and the package-contract test, alongside new src/prompt.ts (14 packed files). Historical benchmark manifests remain unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented and independently verified on main 70951a4 (release 1.2.0). Resolver/integration tests cover default behavior, project/global precedence, trust, verbatim replacement, reload, invalid-file blocking and repaired manual retry. npm run check passed 107/107 with formatting/lint/typecheck green; git diff --check passed. No provider calls or user configuration changes.

Taste/spec reviews were clean. User explicitly authorized direct population of decision-4 as a one-file CLI-rule exception; it is complete. Documentation review found a stale doc-2 package count, corrected via CLI and verified as 14 packed files/seven source modules. Final whole-change review returned merge with no must-fix findings and independently traced both entry paths. Nonblocking notes retained: invalid-prompt warnings intentionally share the documented once/session processing-warning latch; filename-literal pinning and an additional manual post-dispatch abort test were suggested but existing resolver/shared-path coverage remains green. No behavior expansion made during commit preparation.

User explicitly requested commit and push. No npm release, installation change, GitHub issue comment or closure requested.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added full system-prompt replacement via slye-prompt.md, trusted-project > global > built-in. Exact custom text is reread per attempt; blank/unreadable selected files block fallback and provider calls, warn, and permit manual retry. Default request framing and built-in prompt remain unchanged when absent. Documentation, rationale and package verification updated. 107 tests/static checks pass; taste/spec/docs reviews complete and final reviewer approved merge. User approved commit/push; feature is not yet published to npm.
<!-- SECTION:FINAL_SUMMARY:END -->
