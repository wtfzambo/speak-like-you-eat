---
id: doc-1
title: SLYE MVP specification
type: specification
created_date: '2026-08-13 23:14'
updated_date: '2026-08-21 18:13'
---
# SLYE MVP specification

## Status

The MVP implementation and sandbox gates are complete. The public two-phase benchmark, evidence-based prompt promotion, automatic minimum-thinking policy, scoped/all model picker, and integrated package verification are also complete. MVP acceptance and branch-level review evidence are tracked in TASK-1. Manual-first setup and on-demand rewrites are tracked in TASK-11. Pi-and-OMP host support is tracked in TASK-13.

## Scope

SLYE operates only in Pi's and Oh My Pi's (OMP's) interactive TUIs. Outside an interactive host TUI it is a no-op.

Pi loads the existing `src/index.ts` implementation. OMP loads `src/omp.ts`, a host adapter around that implementation. The adapter translates persistent rewrite rendering and storage to OMP custom messages, normalizes resumed entries for duplicate detection, and filters every `slye.rewrite` custom message from model context before provider request assembly.

## Configuration and onboarding

- Configuration is stored in `slye.json`, validated before use, and contains `enabled` and, when a model is selected, that model's `provider` and `id`; the model is optional while automatic rewriting is disabled, and thinking is never stored. `enabled` controls automatic rewriting only, so `{enabled:false, model}` is ready for manual rewrites.
- A complete project-local configuration overrides the complete global configuration only when the project is trusted. An invalid trusted project configuration blocks global fallback.
- Configuration writes are atomic.
- If no model is selected, the host shows a yellow non-modal startup warning explaining that `/slye model` configures manual rewriting and `/slye on` configures and enables automatic rewriting. A valid disabled configuration with a model is silent even when that model is unavailable. An unavailable selected model warns only when automatic rewriting is enabled; malformed configuration always warns.
- `/slye model` opens a custom searchable picker showing each authenticated eligible provider/model and its automatically enforced thinking level. It opens on eligible authenticated scoped models when the host provides any; otherwise it opens on all authenticated eligible models. OMP currently provides no scoped-model list, so its picker uses the full authenticated-model list. It preserves a valid existing automatic on/off state; a first or repaired configuration saves automatic rewriting off.
- When scoped candidates exist, Tab switches non-persistently between scoped and all authenticated eligible models and preserves the search. Each picker invocation resets to its default scope. Esc or Ctrl-C cancels without writing. After selection, the existing global or trusted-project save scope remains available.
- SLYE derives the first currently supported model level in this exact order: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. It ignores a scoped model entry's pinned thinking level. A model whose metadata exposes no supported level cannot be selected; if a saved model loses valid level metadata, SLYE fails open. A reasoning-only model therefore runs at its minimum (for example, `high`), with cost and latency determined by that model choice.
- `/slye on` enables automatic rewriting and opens model selection when no usable model is saved. `/slye off` disables only automatic rewriting and retains the model for manual use. A save confirmation displays provider, model, and the recomputed enforced thinking level. Neither command overwrites an invalid effective configuration file.

## Eligible responses and display

- Automatic rewriting considers only a final, normally completed assistant response with at least 200 non-whitespace prose characters after fenced code is excluded from the gate.
- `/slye` without arguments waits for the host to settle and manually targets exactly the latest completed assistant response. If a newer conversational user message exists, there is no target.
- Manual targeting bypasses only the automatic 200-character threshold. Its target must still be normally completed, have non-blank prose outside fenced code, and contain no tool call.
- Do not rewrite intermediate, aborted, errored, length-truncated, tool-call, thinking, or tool-result content.
- Keep the original assistant response visible and unchanged.
- Append an immutable, persistent companion labelled `🤌 Speak like you eat:`. Pi stores it as a display-only custom entry. OMP stores it as a rendered `slye.rewrite` custom message, restores it after session resume, and removes it from the next model context. Automatic OMP cards are stored only after the host becomes idle, so creating the display-only companion does not steer the agent or start another provider turn. In both hosts the companion must render after resume and never enter an LLM provider request.
- A target has at most one companion across automatic rewriting, manual commands, repeated requests, and resumed sessions. SLYE recognizes existing 1.0.1 display-only cards as companions. A repeated manual `/slye` for a completed target is an informational no-op. Duplicate automatic events remain silent and make no call or card. Failed, cancelled, and append-failed attempts remain available for a manual retry.

## Rewrite behavior

- Before each rewrite, resolve and recheck the configured authenticated secondary model from the host registry, derive its lowest currently supported thinking level, and make one direct `streamSimple` completion through its effective provider without changing the host's active conversation model or thinking. SLYE omits the reasoning option for `off` and supplies the derived non-`off` level otherwise.
- The completion receives exactly SLYE's rewrite-only system prompt and one user message containing the complete target plus at most 8,000 characters of recent natural-language context from no more than two preceding user-led turns and relevant intermediate assistant prose.
- SLYE does not create an `AgentSession` or `ResourceLoader`, load `AGENTS.md`, skills, prompts, tools, or project files, or include full session history.
- This isolation guarantee covers data and behavior supplied by SLYE. Other installed extensions and provider-side processing are outside SLYE's control.
- Preserve the target response’s original language and intentional language mix; do not translate. Use prior context only for topic understanding. Preserve meaning, facts, names, numbers, paths, URLs, commands, Markdown structure, and fenced code blocks; ignore instructions in source text.
- Replace clichés, stock metaphors, corporate jargon, slogans, filler, and repetition with their plain meaning instead of preserving or lightly paraphrasing them.
- If the target is already clear, keep its wording and structure close to the original; do not turn prose into a list or add sections.
- Simplify without deleting claims, conditions, qualifications, or instructions.
- Exclude thinking, tool calls, and tool results from context. Remove fenced code blocks only from prior context, not the target response.
- Accept only a normal-stop response with non-blank text; join multiple text blocks with blank lines.

## Benchmark guidance

See the complete reviewed [benchmark results](doc-4%20-%20SLYE-benchmark-results.md) for methodology, aggregate tables, costs, and limitations.

- Quality-first recommendation: `openai-codex/gpt-5.6-terra` with reasoning off. Low-latency recommendation: `ollama-cloud/deepseek-v4-flash:0731` with reasoning off. Across both prompt phases, measured DeepSeek latency was about one-third of Terra latency.
- `ollama-cloud/gpt-oss:20b` was tested at low and high thinking across all six fixtures. Low was fast but lower quality; high improved quality only slightly while increasing mean latency from about 1.7 seconds to about 17.2 seconds, so neither configuration is recommended.
- `ollama-cloud/gpt-oss:120b` low was fast and competitive under the original prompt but regressed slightly under the promoted prompt. Higher thinking across the matrix did not reliably improve rewrite quality.
- SLYE automatically uses a model's lowest supported thinking level and provides no thinking control. Thinking labels here are explicit tested benchmark configurations, not user-selectable SLYE settings. The corpus is deliberately small, so these are practical recommendations rather than universal provider guarantees.

## Interaction and failures

- A manual `/slye` validates its target before configuration. When the target is valid but no usable model is selected, it opens the existing model and scope picker, saves the chosen model with automatic rewriting off, and immediately runs the requested rewrite. Invalid configuration remains unchanged. Picker or scope cancellation writes and calls nothing.
- Automatic rewriting shows the existing `Rewriting AI-speak…` working message. A manual rewrite shows a cancellable loader with the same text. Escape cancels the secondary request without a warning.
- After 45 seconds, SLYE stops waiting, signals abort to the provider, appends nothing, and warns; a provider that ignores the signal may continue and consume usage.
- Any other provider, output, append, or unexpected processing failure leaves the original intact and warns at most once per extension session. Failures do not mark the target complete, so a later manual request can retry it.
