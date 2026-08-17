# AGENTS.md

How humans and AI agents work in this repository. Perfection is reached not when there is nothing left to add, but when there is nothing left to take away.

## Core standard

Optimize for code that is correct, readable, and easy to maintain by a human. Prefer the simplest design that satisfies the current requirements: build the Fiat Panda that is needed, not an intergalactic rocket.

When principles conflict, use this order:

1. Correctness and explicit behavior.
2. Human readability.
3. Maintainability and testability.
4. Consistency with the existing codebase.
5. Reuse and optimization.

Apply YAGNI and KISS throughout. Optimize what is measured to need it; where a simple implementation may scale badly with real growth, flag it with a comment and move on.

## Plain code

"Scrivi codice come mangi" — write the plain version you would explain aloud. Complexity is the enemy; when in doubt, be the grug-brained developer who says no to it.

- Linear, named steps and boring control flow. If code looks smarter than the problem, rewrite it.
- Guard clauses and early returns over nested conditionals. Keep the happy path visually obvious.
- One nesting level is normal, two should prompt consideration, three is the practical maximum.
- Do not compress straightforward behavior into clever expressions.
- A comment that explains what convoluted code does is a refactoring signal. Comments explain intent, constraints, and trade-offs — never restate the code.

## Modules and ordering

- Each module has one coherent purpose. Keep related behavior close together; avoid designs that need many trivial indirections to understand one operation.
- Mark implementation-only objects as private (language convention permitting); leave only the intentional public interface exposed.
- Extract a function when it names a meaningful operation, isolates a side effect, enables valuable testing, or removes proven duplication — not to shorten line counts.
- A module reads top to bottom: constants and types first, public interface in workflow order, private helpers in one block mirroring their callers, entrypoint glue last. Within each block, caller before callee.
- Remove dead code, speculative extension points, and abstractions with only one trivial use.

## Types and contracts

- Type function signatures and known payloads with types that carry their specific meaning, not a generic shape: a named domain type says more than the primitive underneath it, because it tells the reader what can arrive there.
- When the type checker complains, prefer fixing the type over suppressing the error. Suppressions are fine at library edges that are genuinely badly typed; when a whole area needs them, one explanatory note for the area beats a comment on every line.
- Convert untyped library data to typed shapes where it is cheap and useful; use judgment, not dogma — typing half a library is not the goal.
- A new domain type must earn its place by adding meaning or preventing invalid states. Do not create a type or class that merely repackages existing constants for a single caller.

## State and side effects

Prefer a functional core: keep business logic pure and push I/O to the edges, to the degree the app allows.

- Keep transformation and business-rule code free of side effects. Never hide I/O, clock, randomness, or mutation inside code that looks like pure computation.
- Where the app talks to the outside world, keep that layer thin and explicit; pass dependencies in where it aids understanding and testing.
- No hidden global mutable state. When mutable state is necessary, centralize its ownership.
- Do not introduce classes when a pure function or immutable value is clearer.

## Constants, duplication, abstraction

- Name domain thresholds and operational values; keep them close to the behavior they govern. Purely structural literals — a zero start index, a `+ 1` on a loop bound — need no named constant.
- Remove duplication when the repeated code is the same stable concept. Prefer readable duplication over premature abstraction.
- The deletion test: imagine deleting the abstraction. If complexity vanishes, it was a pass-through — delete it. If complexity reappears at every call site, it earns its keep.
- Do not build generic frameworks for hypothetical future use. Wait until an abstraction has a clear name, contract, and reason to change.

## Errors and logging

- Log meaningful lifecycle events with the identifiers that diagnose them. No per-row logging, no "entered function" noise, never credentials or sensitive payloads.
- Catch exceptions only where recovery, cleanup, translation, or useful context is possible. Fail fast over defensive layers for impossible states.
- Preserve the original exception as the cause when translating errors.

## Tests

Code without meaningful tests is not reliable, but coverage is not the objective. Priority: product behavior visible to a user, then integration boundaries, then unit tests for pure logic and edge cases.

- Test what the code promises, not how it does it: call the function, assert on the result or the visible effect. Public behavior is the default target; a private function with tricky edge cases is worth testing directly too. A refactor that preserves behavior should never break a test.
- Expected values come from an independent source of truth. A test that recomputes the expectation the way the code does passes by construction and proves nothing.
- Avoid mocks that merely assert that mocked methods were called.
- Add a regression test when fixing a reproducible bug. Skip tests for trivial getters, constants, and framework behavior.
- Prefer a few representative fixtures over generated boilerplate.

## Agent behavior

- Understand the existing code and the relevant external API before editing. Trace the real flow; never plan against imagined code.
- Prefer targeted changes over broad rewrites. Do not refactor unrelated working code while implementing a feature.
- Implement one small runnable slice at a time; keep the repository runnable after each slice.
- When unsure how an external system behaves, say so and check: read its documentation, or write a small throwaway script that answers the question. Never present a guess as fact.

## Agent workflow

The main agent plans and orchestrates; five specialist subagents do the specialized work — `implementer`, `taste-reviewer`, `spec-reviewer`, `docs-reviewer`, `final-reviewer`, defined in `.pi/agents/`. Roles do not blur: the implementer is the only subagent that edits, reviewers inspect and report. Each specialist carries its own pinned model, so a reviewer is never the same model as the writer; do not override it at spawn time.

Pandino also installs `fallback-runner`, a non-specialist, inspection-only escape hatch. Use it only when a reviewer cannot launch or complete because its provider, quota, session, or pinned model is unavailable — never because a review found problems or the orchestrator dislikes its result. The orchestrator must supply an explicit alternate model, the failed reviewer's canonical instructions verbatim, and the concrete task context; preserve the review role and tool boundaries. For review work, choose a model different from the writer. Never invoke `fallback-runner` without an explicit model, which would silently inherit the parent, and visibly report every substitution.

Those definitions are written for [pi](https://pi.dev). On another harness, read them as role descriptions and apply the workflow with whatever that harness offers: its own subagent mechanism, separate sessions, or a single agent that adopts one role at a time and states which. If a role cannot be delegated at all, run its review yourself against the same definition and say so — do not skip the step because the mechanism is missing.

1. Plan first. For non-trivial or unclear work, agree on a bounded plan with the user before touching code; load the grilling skill to stress-test it.
2. Delegate the approved plan to the `implementer` subagent. Give it the full plan, not a summary; it implements without re-litigating, and stops and reports if the plan contradicts the real code — treat that report as a planning bug, not an implementation failure.
3. Before every non-trivial commit, run `taste-reviewer` and `spec-reviewer` together on the working diff. Taste judges how the code is written, spec judges what it does against what was asked.
4. Fix or explicitly discuss every must-fix finding before committing. Scope-creep findings from the spec reviewer are product decisions: surface them to the user instead of silently keeping or reverting the extra behavior.

5. Verify the integrated result yourself before reporting done. An agent's report describes intent; only the diff describes outcome. Read the diff, re-run the checks rather than trusting reported ones, own the files no mandate covered — docs and cross-cutting comments are nobody's slice by default — and trace one full user path end to end. Slice-level correctness does not imply the path works.

Before a branch merges, run `docs-reviewer` once before `final-reviewer` when the branch changes documented behavior, public contracts, procedures, architecture/codebase structure, authoritative docs, decisions, or findings. It may also run explicitly as a whole-repo audit; it does not join the mandatory per-commit loop. Then run `final-reviewer` once on the whole branch against its merge base. It judges composition and the end-to-end requirement, which per-commit review cannot see; it does not repeat the taste, spec, or docs passes.

Small fixes the user asked for directly (a rename, a one-line bug) do not need the full loop; use judgment and say what was skipped.

The orchestrator wrote the plan, so it is the least neutral judge of it: a plan's author defends the plan by default. That is why the separate reviewers exist, and why their pass does not replace the orchestrator's — reviewers judge the diff against the spec, while the orchestrator alone knows what was discussed and rejected, which never appears in the diff.

## Definition of done

A change is complete when its behavior satisfies the requirement, the implementation reads without excessive explanation, public contracts are typed, meaningful behavior is tested, the project's formatter, linter, type checker, and tests all pass, and no dead code, secrets, debug output, or speculative machinery remains.

<!-- Project-specific sections go below this line: toolchain, domain context,
     session continuity IDs, infra conventions. Keep them short; the principles
     above do not change per project. -->

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.50.1 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `backlog instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->

<!-- pandino:document-governance -->
## Document governance

Keep one authoritative home for each kind of knowledge:

- Current product truth belongs in `backlog/docs/specs/`, managed with `backlog doc` as type `specification`.
- Human-run procedures belong in `backlog/docs/runbooks/`, normally as type `guide`.
- Current module or codebase explanations belong in `backlog/docs/codebase/`.
- Rationale and trade-offs belong in `backlog/decisions/`.
- Planned work, status, and investigation trace belong in `backlog/tasks/`.
- Durable falsified hypotheses belong in root `FINDINGS.md`.

When current behavior changes, update the current specification and add a decision for a meaningful choice. Manual procedures are runbooks. Decisions explain why a choice was made; they do not become the current specification. README and AGENTS.md may orient and link, but must not duplicate authoritative product truth.

`FINDINGS.md` is not a changelog, session diary, or source of current truth. Create it only when the first qualifying finding exists. A finding qualifies only when reproducible evidence or an authoritative source falsifies a plausible hypothesis that is likely to be retried and remains useful after the task closes. Each entry records the hypothesis, evidence, practical consequence, and links to the relevant task, specification, or decision. Announcements, refactors, file moves, and provisional failed attempts do not qualify. Later evidence adds a superseding finding instead of silently rewriting history.

Do not add OKF, a validator, index or log generation, migration logic, or metadata beyond Backlog's own.

<!-- pandino:session-continuity -->
## Session continuity

Context does not persist between agent sessions. Preserve it with one personal Backlog task per operator named `Session pickup — <name>`. The task is a replaceable current snapshot, not a diary; Git history and normal Backlog tasks preserve history.

At the start or resumption of project work:

1. Run `backlog instructions overview`.
2. Find the operator's task with `backlog search "Session pickup" --plain` and read it with `backlog task view <ID> --plain`.
3. Follow the durable file and task references in the snapshot instead of relying on duplicated context.
4. Verify reality with `git status -sb`, `git log --oneline -5`, the referenced Backlog tasks, and any checks named in the snapshot. If reality differs, trust the repository and tools.
5. Continue from the first actionable item under `WHAT'S NEXT`.

Update the pickup task exactly once, as the last project action of the session or immediately before an explicit handoff — never after each intermediate change, and never as an appended log. The replacement snapshot must answer, in this order:

1. `WHERE WE LEFT OFF` — absolute date, branch and commit, push state, clean or dirty tree, completed and partial work, with durable references.
2. `WHAT'S NEXT` — ordered concrete actions, preferably with the exact first command or file.
3. `WAITING ON / GATED BY` — decisions, people, credentials, or external services, with absolute dates.
4. `VERIFY` — commands that prove the snapshot still matches reality.

Write for a reader with zero memory. Record substantial future work as normal Backlog tasks; the pickup task only points to it. If an operator has no pickup task, create one through the Backlog CLI with the `continuity` and `handoff` labels, high priority, and the operator as assignee.

<!-- pandino:parallel-agents -->
## Parallel implementation

For large, complex codebases where work genuinely splits across several agents at once. On small or short-lived projects, ignore this section: one implementer at a time is the default. Parallelism buys wall-clock time and costs orchestration attention, so it must earn its place.

### Foundations first, then parallel

Do not run agents in isolation and reconcile afterwards with a "merger" agent. Real collisions between slices are usually design decisions — which shape an event takes, which table owns a column — and a merger cannot settle those without re-deciding, which means redoing the work.

Instead, one agent does the shared core alone: the enum every slice touches, the state machine, the shared constants. Only then do the rest run in parallel, on genuinely disjoint files.

The foundations slice must leave the repository compiling and green. Removing an API without fixing its callers is not a foundation, it is a broken tree every downstream agent inherits.

### Isolate the working directories

Give each parallel agent its own worktree. Sharing one directory means a check run mid-flight measures another agent's half-finished work, and the time goes into proving it was not a bug.

Isolation requires committing the foundations before the downstream agents start, which is cleaner anyway — each begins from a stable base instead of from someone's uncommitted work:

```
foundations -> commit -> one worktree per agent from that commit -> merge each
```

### Mind the gaps between mandates

Agents can each do their slice correctly, report truthfully, and still leave bugs in the space no mandate covered: a constant that disagrees across two slices, documentation describing deleted behavior, a stub that means the feature does not work end to end. Those are orchestration errors, not agent failures.

So write mandates that name the files each agent owns, assign the leftovers to yourself, and integrate as described in the workflow above: read the diff, re-run the checks, trace one user path end to end.

### Match review depth to review cost

Review each slice as it lands with the two per-commit reviewers, then run `final-reviewer` once on the whole branch before merging. That single expensive pass is where cross-slice contradictions surface — stale user-facing copy, constants that disagree — which per-slice reviews structurally cannot see.
