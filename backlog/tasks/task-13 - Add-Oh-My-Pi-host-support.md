---
id: TASK-13
title: Add Oh My Pi host support
status: Done
assignee:
  - '@rubybrowncoat'
created_date: '2026-08-21 16:49'
updated_date: '2026-08-21 19:21'
labels: []
dependencies: []
references:
  - README.md
  - src/index.ts
  - src/omp.ts
  - test/omp.test.ts
  - test/package-contract.test.ts
  - backlog/docs/specs/doc-1 - SLYE-MVP-specification.md
  - backlog/docs/runbooks/doc-2 - SLYE-sandbox-manual-checks.md
modified_files:
  - .gitattributes
  - README.md
  - package.json
  - package-lock.json
  - src/index.ts
  - src/omp.ts
  - test/omp.test.ts
  - test/onboarding.test.ts
  - test/package-contract.test.ts
  - backlog/docs/specs/doc-1 - SLYE-MVP-specification.md
  - backlog/docs/runbooks/doc-2 - SLYE-sandbox-manual-checks.md
priority: high
type: feature
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publish SLYE as one npm package that preserves the existing Pi extension while adding a separate Oh My Pi adapter. The adapter must preserve display-only rewrite semantics, duplicate detection across resumed sessions, model selection, and fail-open behavior without exposing rewrite cards to provider context.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the separate src/omp.ts adapter while preserving Pi behavior. The only src/index.ts change awaits the host append result: Pi's native synchronous void append remains immediate, while OMP can propagate deferred persistence success or failure before the target is marked complete. The package contract publishes both host entry points and exactly the intended 13 public files. OMP integration tests cover renderer and message translation, context filtering and fallbacks, bound methods, manual and automatic persistence, live duplicate suppression, resumed custom_message normalization, the missing-getProvider facade, and warning plus manual retry after a deferred send failure.

The lockfile retains all 167 original package name/version identities: zero added, zero removed, and zero changed version/resolved entries. Both root and nested @earendil-works/pi-ai placements resolve to the original 0.84.1. npm ci succeeded with 0 vulnerabilities.

The OMP 17.4.0 compiled-TUI smoke used disposable no-cost local provider/model slye-local/rewrite-test. Request 1 produced the primary response and request 2 the rewrite. The TUI displayed the persistent rewrite card and returned idle without a continuation request. /slye made no provider call before exit or after resuming session 01a0258c-1fb6-7000-b6c2-f897ba347742; the resumed card rendered correctly. A follow-up turn produced request 3 with roles system,user,assistant,user. Its raw payload contained neither slye.rewrite metadata nor the rewrite display text, while retaining the initial assistant response and follow-up prompt. This proves display-only context exclusion in a real supported OMP runtime.

The smoke exposed and drove regressions for two OMP 17.4 defects: messages sent while streaming become steer/drain input, so appendEntry waits for host idle before sendMessage(triggerTurn:false); OMP's compiled Pi renderer shim can throw the exact uninitialized getMarkdownTheme color-mode TypeError, so the adapter falls back only for that host defect and preserves all other failures. Deferred scheduling releases the OMP event handler so streaming can finish, while the core continues awaiting delivery; scheduling or send failures warn and leave the target manually retryable.

Fresh verification: Biome checked 32 files, TypeScript passed, npm run check passed 100/100 tests, git diff --check exited 0 with only governed-doc line-ending warnings, and npm pack --dry-run --json returned the exact 13-file public contract. The disposable smoke directory and processes were removed. User-owned handoff artifacts and the empty Backlog decision artifact remain preserved and excluded from the package.

2026-08-21 authenticated one-off: OMP 17.4.0 ran the working-tree adapter against `openai-codex/gpt-5.6-luna`. The primary turn produced an eligible detailed response, then `/slye` selected Luna for project-only manual rewrites and made one successful rewrite call. The `🤌 Speak like you eat:` card rendered in the TUI, preserved the original qualifications and concrete examples, removed filler, and returned to idle with the working indicator cleared. OMP's first-run composer setup restarted the primary turn without the requested no-tools/no-rules flags, causing one failed read-only `node_repl` attempt (`backlog` ENOENT) before the answer; therefore this was one user turn but not a strict single-request primary call. No repository files changed during the run. `--no-session` still updated shared OMP setup/log/history/model-cache files; the exact temp-named memory bank and disposable project directory were deleted after verification, while shared profile databases/config were left intact. Provider-context exclusion was not re-instrumented in this external call; the earlier raw-request OMP 17.4 local-provider proof remains the authoritative context-isolation evidence.

2026-08-21 cleanup: at the operator's explicit request, the superseded README-FIRST.md, VALIDATION.md, and CHANGED-FILES.md handoff artifacts were deleted. The unrelated empty CLI-created decision-4 artifact remains untouched.

2026-08-21 pre-push cleanup: removed the empty CLI-created decision-4 artifact after final verification showed it was outside TASK-13's modified-file list and caused git diff --check to fail.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a separate OMP entry point and adapter while preserving the Pi entry point and behavior. Merged the Windows-safe dual-entry package contract, added OMP integration coverage including deferred persistence failure/retry, documented both hosts, and preserved every original locked dependency identity and version. Verified with npm ci, npm run check (100/100), git diff --check, an exact 13-file npm pack dry run, and a real OMP 17.4.0 compiled-TUI smoke proving persistent rendering, resume/duplicate suppression, idle delivery, and exclusion of slye.rewrite metadata/content from the next provider request. Taste, specification, documentation, and whole-change reviews pass.
<!-- SECTION:FINAL_SUMMARY:END -->
