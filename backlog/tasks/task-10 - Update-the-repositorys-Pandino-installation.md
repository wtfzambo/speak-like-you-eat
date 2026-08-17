---
id: TASK-10
title: Update the repository's Pandino installation
status: Done
assignee:
  - '@zambo'
created_date: '2026-08-17 00:53'
updated_date: '2026-08-17 01:06'
labels: []
dependencies: []
references:
  - 'https://github.com/wtfzambo/pandino'
modified_files:
  - .gitignore
  - AGENTS.md
  - .pi/agents/fallback-runner.md
  - .pi/skills/grilling/SKILL.md
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Refresh this repository from the latest wtfzambo/pandino installer while preserving SLYE-specific product, release, security, documentation-governance, build, and team rules. Retain the existing pi-only harness selection, Backlog/document-governance/session-continuity/parallel-agent options, existing model assignments, and no local i-have-adhd skill. Resolve all staged candidates and leave the reviewed result uncommitted and unpushed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The latest Pandino installer is rerun with pi as the only editor and the repository's existing optional sections remain enabled exactly as before
- [x] #2 Every candidate under .pandino/merge is semantically merged, .pandino/merge is deleted, and .pandino/snippets is retained
- [x] #3 All six pi helpers are available; the five specialists retain explicit model pins and fallback-runner has no model pin
- [x] #4 SLYE-specific product, release, security, documentation-governance, build, benchmark, and team rules remain intact while compatible current Pandino workflow is adopted
- [x] #5 The complete diff is reviewed and npm run check plus Pandino installation integrity checks pass without committing or pushing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep a clean baseline and retain the verified existing choices: pi only; Backlog, document governance, session continuity, and parallel-agent guidance enabled; no local i-have-adhd; existing three persisted pi model roles.
2. Run the current remote installer from `https://raw.githubusercontent.com/wtfzambo/pandino/main/install.sh` with `--no-input`. In an already-Backlog-enabled repository this preserves Backlog automatically, selects only pi, leaves the existing parallel section in place, and does not add ADHD.
3. Inspect every generated `.pandino/merge/` candidate against its destination and merge the current generic Pandino text while retaining all SLYE-specific and Backlog-generated sections. Compare each enabled optional section in AGENTS.md with the refreshed snippet and adopt compatible upstream updates manually.
4. Remove `.pandino/merge/` after all candidates are resolved; keep `.pandino/snippets/`. Do not edit governed task Markdown outside the Backlog CLI.
5. Review the full diff for installer side effects. Verify exactly six `.pi/agents` definitions, exact source parity apart from specialist model lines, explicit pins for implementer/taste/spec/docs/final, no model line on fallback-runner, and unchanged `.pandino/models.json` assignments.
6. Run `npm run check`, both benchmark dry-runs, manifest cleanliness, `git diff --check`, and targeted structural assertions. Run no provider/model calls. Record evidence and finalize TASK-10, but do not commit or push because the user requested an uncommitted reviewable diff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ran the latest remote installer from wtfzambo/pandino main with `--no-input`, retaining existing Backlog and pi-only selection. Merged the sole `.pandino/merge/AGENTS.md` candidate into AGENTS.md by adopting the current five-specialist wording and fallback-runner policy while preserving the Backlog 1.50.1 block plus SLYE document-governance, session-continuity, and parallel-agent sections. Installed canonical unpinned `.pi/agents/fallback-runner.md`, refreshed the upstream grilling skill punctuation, and accepted the installer-managed `.pi/npm/` ignore. `.pandino/merge/` is removed; all three `.pandino/snippets/` files remain and their enabled AGENTS sections are current. No other editor harness or local ADHD skill was added; `.pandino/models.json` is unchanged.

Integrated checks passed: `npm run check` (75 tests), phase-one dry-run (108 rows, fingerprint `80d7d401fe9862d3d558efc4ba8b674014dd3e7e975f02d77cc3b37c30fbd759`), phase-two dry-run (9 rows, fingerprint `59fc67e920727f25b40b1fd874cda6b51aff9f98426ae09af27275a4fda96728`), unchanged committed manifests, `git diff --check`, canonical agent-body comparison, six-agent count, five exact model pins, and unpinned fallback-runner. No provider/model call, commit, or push occurred.

Taste and spec reviews found no blocking issue; docs review found no documentation drift. The taste review noted a branch-scoped continuity paragraph present only in Pandino's own project AGENTS.md, not in the canonical generic `snippets/session-continuity.md`; it was intentionally not copied because this update adopts generic installer authority while preserving target-repository rules. The spec review's timestamp minor was a UTC-versus-local-mtime observation, not stale metadata. One non-blocking upstream installer caveat remains: this repository tracks `.pi/npm/.gitignore`, so `git check-ignore -q .pi/npm/` does not recognize the root `.pi/npm/` rule even though package contents are ignored; a future installer rerun may append a duplicate root ignore block. Fixing Pandino's installer guard is outside this repository update and no follow-up was created without user approval.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Updated the repository from current wtfzambo/pandino main using its remote installer with the existing pi-only and optional-section choices. Added the canonical unpinned fallback-runner and its constrained reviewer-substitution policy, refreshed grilling, retained all SLYE/Backlog/governance/continuity/parallel rules and exact model assignments, resolved and removed the merge staging directory, and preserved snippets. Verified 75 tests, both immutable benchmark dry-run fingerprints, manifest cleanliness, six canonical Pi helpers with five exact pins, and no extra harness or ADHD skill. No model call, commit, or push occurred; one minor upstream future-rerun ignore-rule idempotency caveat is documented.
<!-- SECTION:FINAL_SUMMARY:END -->
