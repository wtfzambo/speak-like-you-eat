---
id: TASK-13
title: Strip empty affirmation/negation contrasts during rewriting
status: Done
assignee:
  - '@zambo'
created_date: '2026-08-30 09:59'
updated_date: '2026-08-30 10:43'
labels: []
dependencies: []
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
New AI models pad prose with a reflexive contrast pattern: "this does X, not Y" where the negated alternative was never at issue and adds no information. The user wants SLYE's rewrite to erase this pattern. The rewrite system prompt in src/model-rewrite.ts is the lever; the spec (doc-1) and test/model-rewrite.test.ts mirror its lines. Benchmark prompt variants are pinned historical snapshots and must stay unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The rewrite system prompt instructs the model to drop negated alternatives that carry no information, while keeping informative negations (real claims, conditions, warnings)
- [x] #2 doc-1 SLYE MVP specification's rewrite behavior section reflects the new prompt line
- [x] #3 Tests, lint, and type checks pass; benchmark prompt variants remain byte-identical
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add one line to REWRITE_SYSTEM_PROMPT in src/model-rewrite.ts, after the cliché-replacement line: instruct the model to remove "X, not Y" contrasts whose denied alternative adds no information, while keeping negations that state a real limit, exception, or correction.
2. Mirror the line in expectedSystemPromptLines in test/model-rewrite.test.ts.
3. Mirror the line in the Rewrite behavior section of doc-1 via backlog doc update.
4. Leave benchmark/prompt-variants.ts untouched (pinned snapshots); benchmark.test.ts asserts production prompt differs from PHASE_TWO, which stays true.
5. Run format, lint, typecheck, tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
One new instruction line in REWRITE_SYSTEM_PROMPT after the cliché line; mirrored in test/model-rewrite.test.ts expectedSystemPromptLines and in doc-1 Rewrite behavior. benchmark/prompt-variants.ts untouched (pinned snapshots); benchmark.test.ts asserts the production prompt differs from PHASE_TWO, which still holds. Skipped the taste/spec reviewer loop: single-line prompt change requested directly by the user.

A/B probe with an isolated runtime (deepseek-v4-flash:0731, throwaway script, deleted) showed the first wording barely changed output; sharper v2 wording ("Delete ... state only the affirmative fact. Keep a negation only when it warns about a concrete mistake the reader could plausibly make.") removed all four decorative contrasts in the padded fixture while keeping the proxy-timeout warning and the env-dependent default warning. It also dropped "not a performance optimization" — acceptable trade-off. Source, test, and doc-1 updated to v2; checks re-run green (92/92).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a rewrite rule that deletes decorative "X, not Y" and "not A, but B" constructions while retaining negations that warn about plausible concrete mistakes. An A/B probe with ollama-cloud/deepseek-v4-flash:0731 showed the stricter wording removed the padded contrasts while retaining operational warnings. Updated source, prompt assertion, and doc-1; benchmark snapshots remained untouched. Verified with npm run check: formatter/linter/typecheck passed and 92/92 tests passed.
<!-- SECTION:FINAL_SUMMARY:END -->
