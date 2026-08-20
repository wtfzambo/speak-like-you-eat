---
id: doc-2
title: SLYE sandbox manual checks
type: guide
created_date: '2026-08-13 23:14'
updated_date: '2026-08-20 18:06'
---
# SLYE sandbox manual checks

## Purpose

Use the durable sibling sandbox at `../speak_like_you_eat_sandbox` from this repository to manually verify each completed SLYE slice before starting the next one. From inside the sandbox, the package source is `../speak_like_you_eat`; Pi may persist that source relative to `.pi/settings.json` as `../../speak_like_you_eat`. Expected product behavior belongs in the [SLYE MVP specification](../specs/doc-1%20-%20SLYE-MVP-specification.md).

## One-time setup

From this repository, enter the sandbox and configure the local package with Pi's project-local package mechanism. Do not add secrets or change global Pi settings.

```sh
cd ../speak_like_you_eat_sandbox
pi install -l ../speak_like_you_eat
```

This writes the sandbox's `.pi/settings.json`. Use `--approve` only for the current verification command when Pi needs to trust the sandbox.

## Slice checks

### Slice 1 — package foundation

From this repository, `npm test` verifies the manifest-to-module import. From inside the sandbox, run:

```sh
pi list --approve
```

This confirms the project-local package registration and path; it does not confirm extension factory execution. This command must not submit a prompt or request a model. For the manual Pi loader/startup check, run the following command, inspect startup for extension load errors, then exit without submitting a prompt:

```sh
pi --approve --offline
```

### Slice 2 — configuration and onboarding (no model call)

Do not change global Pi settings. Before starting, delete only `../speak_like_you_eat_sandbox/.pi/slye.json` if it exists. `This project only` appears only for a trusted project; `--approve` supplies that trust for the current run.

First check whether Pi's agent directory already has `slye.json`:

```sh
ls "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/slye.json"
```

If it exists, do not delete or modify it. Test the startup warning with a temporary isolated agent directory, or skip and report that case as preconfigured:

```sh
cd ../speak_like_you_eat_sandbox
PI_CODING_AGENT_DIR="$(mktemp -d)" pi --approve
```

The isolated run has no authenticated models. Test model selection separately in a normal run so Pi can show authenticated models:

```sh
cd ../speak_like_you_eat_sandbox
pi --approve
```

Do not submit a prompt or make a model request:

1. In the isolated run, confirm the yellow non-modal warning distinguishes `/slye model` (configure manual rewriting) from `/slye on` (configure and enable automatic rewriting).
2. In a normal run, run `/slye model`, choose an authenticated candidate, then choose `This project only`.
3. Exit Pi and verify `.pi/slye.json` contains the selected `provider` and `id` with `"enabled": false`.
4. Start Pi again and confirm the valid disabled configuration is silent. Run `/slye model`, select a different candidate, choose the same scope, exit, and confirm `"enabled": false` remains while the model changed.
5. Start Pi again, run `/slye on`, confirm it restores the saved model without opening a picker, then exit. Verify `.pi/slye.json` now has `"enabled": true`.
6. Start Pi once more, run `/slye off`, and verify `.pi/slye.json` has `"enabled": false` while retaining the model. Do not submit a prompt or make a model request at any point.

### TASK-1.1 — model picker and automatic thinking (no model call)

Run this check in the normal authenticated sandbox, not the isolated agent-directory run. Do not submit a prompt or make a model request at any point in this section.

```sh
cd ../speak_like_you_eat_sandbox
before="$(mktemp)"
had_project_config=0
if test -f .pi/slye.json; then
  cp .pi/slye.json "$before"
  had_project_config=1
  cat "$before"
else
  printf '%s\n' '.pi/slye.json is absent'
fi
pi --approve
if test "$had_project_config" -eq 1; then
  cmp "$before" .pi/slye.json
else
  test ! -e .pi/slye.json
fi
comparison_status=$?
rm "$before"
test "$comparison_status" -eq 0
```

1. Record the command output above before changing anything. Run `/slye model`. Confirm each candidate row shows provider, model, and `thinking: <level>`, then search by provider, model ID, or model name.
2. When the normal session has eligible authenticated scoped candidates, confirm the picker starts at Scoped models. Press Tab to show All authenticated models, then press Tab again to return to Scoped models; confirm the search remains. If there are no scoped candidates, confirm it starts at All authenticated models and Tab does not offer a scope switch.
3. Press Esc or Ctrl-C to cancel, then exit Pi. The remaining shell commands compare `.pi/slye.json` with its pre-launch state, remove the temporary copy, and return a failure status if cancellation wrote anything.
4. Reopen Pi, run `/slye model`, select a candidate, choose `This project only`, then exit. Inspect `.pi/slye.json` and confirm it contains only `enabled` and model `provider`/`id`, with no `thinking` field.
5. Reopen Pi, run `/slye off`, then `/slye on`. Confirm the enable notification repeats the selected provider/model and its recomputed `thinking: <level>`. Exit without submitting a prompt or making a model request.

A terminal check cannot observe SLYE's provider payload. Automated evidence is `test/display.test.ts`'s `calls the configured authenticated model once with an isolated exact rewrite payload` and `test/model-rewrite.test.ts`'s `builds one isolated user message with labelled context, the complete target, and the promoted prompt`; run `npm test` to exercise them.

### Slice 4 / TASK-11 — manual-first and automatic rewrite checks (provider calls)

Do not run this section now. Every numbered step marked **Provider calls** requires explicit operator approval immediately before it runs. A submitted prompt makes one primary provider call; an actual SLYE rewrite makes one secondary provider call. Run the preceding picker and configuration checks in sessions separate from the provider-call steps; those checks make no provider calls.

Use a disposable authenticated profile with no existing SLYE configuration for the manual-first check, or record that the first-time case cannot be isolated without changing a protected global configuration. Start Pi from the sandbox only after approval:

```sh
cd ../speak_like_you_eat_sandbox
pi --approve
```

1. **Provider calls: one primary, then one secondary after explicit `/slye`.** Submit a prompt designed to produce a normally completed answer shorter than 200 non-whitespace prose characters for the manual-threshold check. Confirm no automatic card appears because automatic rewriting is not enabled. Run `/slye`, choose a model and scope when prompted, and approve the secondary call. Confirm the original remains unchanged, one `🤌 Speak like you eat:` card appears, and the saved configuration has `"enabled": false`.
2. **Provider calls: no new primary or secondary call.** Run `/slye` again for that completed target. Confirm the informational completed-target message and that no duplicate call or card appears.
3. **Provider calls: one primary only.** While automatic rewriting remains off, submit a long-answer prompt that would satisfy automatic eligibility. Confirm no automatic secondary call or card appears.
4. Run `/slye on` and confirm automatic rewriting is enabled without opening a picker when the saved model is usable. **Provider calls: one primary and one automatic secondary.** Submit a long-answer prompt. Confirm the unchanged original, `Rewriting AI-speak…`, and exactly one companion card.
5. Run `/slye off` and confirm the model remains saved with `"enabled": false`. **Provider calls: one primary only, then a secondary only if explicitly invoked.** Submit another long-answer prompt and confirm no automatic card. Run `/slye` only if separately approved, then confirm one manual secondary call and one card.
6. **Provider calls: one primary, one cancelled secondary, then one retry secondary.** Submit a new eligible answer while automatic rewriting is off. Run `/slye`, press Escape while `Rewriting AI-speak…` is visible, and confirm there is no warning or card. Run `/slye` again and approve the retry; confirm one card appears. A cancelled secondary request may still consume usage.
7. Exit and resume the session. **Provider calls: none.** Confirm every existing companion card still renders, legacy display-only cards are not duplicated, and resume alone adds no card. For a target that already has a card, run `/slye` only if separately approved and confirm the completed-target message rather than a new call or card.

### Slice 5 — final package verification

Run this package procedure without starting Pi interactively or submitting a prompt/model request.

```sh
npm ci
npm run check
npm pack --dry-run --json
```

The dry run must contain exactly 12 files: `LICENSE`, `README.md`, `package.json`, `imgs/front.png`, the packaged specification and benchmark-results documents (`doc-1` and `doc-4`), and the six shipped `src/` TypeScript files. It must exclude `test/`, `backlog/tasks/`, `backlog/decisions/`, the sandbox runbook (`doc-2`), `AGENTS.md`, `.pi/`, `.pandino/`, and sandbox data.

After publication, check the public package from a fresh temporary project without submitting a prompt or making a model request:

```sh
(
  set -e
  project_dir="$(mktemp -d)"
  trap 'rm -rf "$project_dir"' EXIT
  (cd "$project_dir" && pi install -l npm:speak-like-you-eat)
  (cd "$project_dir" && pi list --approve)
)
```

For an isolated tarball smoke before publication, create temporary package, agent, and project directories. Install the tarball beneath the temporary Pi agent npm root, write the exact package source to temporary agent settings, list it from the empty temporary project, then remove all temporary directories on success or failure:

```sh
(
  set -e
  package_version="$(node -p "require('./package.json').version")"
  package_dir=""
  agent_dir=""
  project_dir=""

  cleanup() {
    rm -rf "$package_dir" "$agent_dir" "$project_dir"
  }

  trap cleanup EXIT
  package_dir="$(mktemp -d)"
  agent_dir="$(mktemp -d)"
  project_dir="$(mktemp -d)"
  mkdir -p "$agent_dir/npm"
  printf '{\n  "name": "temporary-pi-agent-npm"\n}\n' > "$agent_dir/npm/package.json"
  tarball="$(npm pack --silent --pack-destination "$package_dir")"
  npm install --prefix "$agent_dir/npm" --legacy-peer-deps --ignore-scripts --no-audit --no-fund "$package_dir/$tarball"
  printf '{\n  "packages": ["npm:speak-like-you-eat@%s"]\n}\n' "$package_version" > "$agent_dir/settings.json"
  (cd "$project_dir" && PI_CODING_AGENT_DIR="$agent_dir" pi list --approve)
)
```

The list must find `npm:speak-like-you-eat@<current package version>` using the version derived from `package.json`, and no temporary files may remain.

### Later slices

After each later slice, start Pi from the sandbox with `pi --approve --offline` when the check does not require a configured model, or normally when it does. Exercise only the behavior added in that slice, compare the result with the specification, and stop before beginning the next slice if the manual check fails.

Keep the sandbox package source pointed at this local repository. Use `pi install -l` for the project-local package, and do not place credentials in the sandbox.
