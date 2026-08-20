---
id: TASK-12
title: Release SLYE 1.1.0
status: In Progress
assignee:
  - '@zambo'
created_date: '2026-08-20 19:42'
updated_date: '2026-08-20 19:43'
labels: []
dependencies: []
documentation:
  - doc-5
  - doc-2
priority: medium
type: task
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Release the completed TASK-11 on-demand/manual-first SLYE feature through the existing stable-only Release Please and npm OIDC pipeline. Preserve the 1.0.1 artifact history, unchanged benchmark evidence, exact 12-file package contract, and paused TASK-7 scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The reviewed TASK-11 branch and the previously local main commits are integrated on main and pushed without changing historical benchmark manifests or adding unapproved feature scope
- [ ] #2 Release Please creates an exact 1.1.0 release PR whose package, lockfile, manifest, and changelog changes are internally consistent and whose hosted no-call checks pass
- [ ] #3 Merging the release PR creates stable tag and GitHub Release v1.1.0 and publishes the exact tag to npm latest through the configured OIDC trusted publisher without an npm token
- [ ] #4 npm metadata, provenance, immutable hashes, the exact 12-file artifact, and a clean temporary Pi package load are verified without additional model or benchmark execution calls
- [ ] #5 The operator sandbox manual rewrite and duplicate-suppression smoke result is recorded, and final release URLs and verification evidence are preserved in TASK-12 and the session pickup
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Re-run the complete no-call release gate on `task-11-manual-rewrites`, record the operator sandbox manual/dedup smoke, fast-forward local `main`, and push `main` only after confirming the branch and historical benchmark evidence are clean.
2. Watch the Release workflow create the Release Please PR for the Conventional Commit-derived 1.1.0 release. Inspect the generated manifest, package, lockfile, and changelog diff; verify hosted PR checks and review the exact release branch without provider calls.
3. Merge the reviewed Release Please PR, then watch the Release and Publish package workflows create stable tag/release `v1.1.0` and publish that exact tag through npm OIDC.
4. Verify GitHub and npm metadata, `latest`, provenance, immutable registry hashes, the exact 12-file artifact, and a clean temporary Pi installation/update without model calls.
5. Finalize TASK-12 with objective URLs and hashes, update the session pickup, and push only the resulting chore records; confirm they do not create another release.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Operator manual smoke passed on 2026-08-20 in the durable sibling sandbox against the local TASK-11 branch: a completed short response was manually rewritten into one SLYE companion; a second `/slye` reported the existing companion and created no duplicate. Project configuration was saved manual-only (`enabled: false`) for `ollama-cloud/deepseek-v4-flash:0731`. This operator-run smoke made the expected primary and secondary provider calls; do not add further provider calls during release verification.
<!-- SECTION:NOTES:END -->
