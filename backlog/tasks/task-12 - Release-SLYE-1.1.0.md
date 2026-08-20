---
id: TASK-12
title: Release SLYE 1.1.0
status: Done
assignee:
  - '@zambo'
created_date: '2026-08-20 19:42'
updated_date: '2026-08-20 19:52'
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
- [x] #1 The reviewed TASK-11 branch and the previously local main commits are integrated on main and pushed without changing historical benchmark manifests or adding unapproved feature scope
- [x] #2 Release Please creates an exact 1.1.0 release PR whose package, lockfile, manifest, and changelog changes are internally consistent and whose hosted no-call checks pass
- [x] #3 Merging the release PR creates stable tag and GitHub Release v1.1.0 and publishes the exact tag to npm latest through the configured OIDC trusted publisher without an npm token
- [x] #4 npm metadata, provenance, immutable hashes, the exact 12-file artifact, and a clean temporary Pi package load are verified without additional model or benchmark execution calls
- [x] #5 The operator sandbox manual rewrite and duplicate-suppression smoke result is recorded, and final release URLs and verification evidence are preserved in TASK-12 and the session pickup
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

Release completed on 2026-08-20. Local `main` fast-forwarded through TASK-11 and was pushed at `b8e553b`. Because that head commit intentionally contained `[skip ci]`, the normal push event did not start Actions; the documented `workflow_dispatch` path started Release run https://github.com/wtfzambo/speak-like-you-eat/actions/runs/32410266127, which created PR https://github.com/wtfzambo/speak-like-you-eat/pull/3 at `befc6f6`. Its four-file generated diff consistently set manifest/package/lock/changelog to 1.1.0 and listed exactly the three in-range feature commits. GitHub initially required workflow approval for the bot-created PR; after explicit approval, hosted run https://github.com/wtfzambo/speak-like-you-eat/actions/runs/32410296325 passed `npm ci`, 92 tests/Biome/TypeScript, both historical no-call dry-runs, manifest cleanliness, and package dry-run. Taste and spec reviews passed with no findings. The pinned Opus final reviewer failed with `Connection error.` and was visibly replaced under the fallback policy by explicit `openai-codex/gpt-5.6-sol`; the fallback verdict was `merge` with no findings.

PR #3 merged as `e1725d982ec5b03fe26e7d637ce2d9384c3ef820`. Release run https://github.com/wtfzambo/speak-like-you-eat/actions/runs/32410762226 created stable https://github.com/wtfzambo/speak-like-you-eat/releases/tag/v1.1.0 and dispatched publish run https://github.com/wtfzambo/speak-like-you-eat/actions/runs/32410785584. The OIDC workflow passed every gate and published npm `latest` 1.1.0 without a token. Registry shasum is `8484e8310f0c5ea302f605b62a4b7ef68b3d2611`; integrity is `sha512-Y4tlPoo1DHdubOUjiq374QFZrkkQMnGSWNwibuSB5kGgT0zxPUy1W5kTqjpDystgsTc+VygM5AG+v9RmN32JEA==`. SLSA provenance names repository `wtfzambo/speak-like-you-eat`, `.github/workflows/publish.yml`, and commit `e1725d9`. The registry tarball contains exactly 12 files, its README matches the tag, and an isolated temporary Pi agent/project installed and listed `npm:speak-like-you-eat@1.1.0`. Historical benchmark manifests remained unchanged. Apart from the operator-run manual sandbox smoke already recorded, release verification made no model or benchmark execution calls.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Released SLYE 1.1.0 through the stable Release Please and npm OIDC path. Merged the reviewed TASK-11 work to main, reviewed and merged generated PR #3, created stable tag/GitHub Release v1.1.0, and published npm latest from the exact tag. Verified hosted no-call gates, 92 tests, unchanged benchmark evidence, SLSA provenance, immutable registry hashes, the exact 12-file artifact, source-matching README, and a clean Pi installation. The operator also verified manual rewriting and duplicate suppression in the durable sandbox.
<!-- SECTION:FINAL_SUMMARY:END -->
