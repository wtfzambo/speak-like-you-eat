# SLYE - Speak like you eat

<p align="center">
  <img src="./imgs/front.png" alt="Speak like you eat" width="720">
</p>

<h6 align="center"><i>Translate AI garbage to human language</i></h6>

SLYE is a Pi package that adds a plain-language rewrite after a completed response.

In Italian, “speak like you eat” (*parla come mangi*) means being straightforward instead of using big, clever, empty words. SLYE applies that idea to AI output.

*Deliberately inspired by [Claudish to English](https://github.com/gvzdv/claudish-to-english)*

## Install

```sh
# Available to all projects
pi install npm:speak-like-you-eat

# Available only in the current project
pi install -l npm:speak-like-you-eat
```

## Use

1. After Pi finishes an answer, run `/slye` for an eligible target. It rewrites the latest completed assistant response once and adds a plain-language rewrite card below the unchanged original; if you have typed a follow-up since, there is no target.
2. If no usable model exists, `/slye` opens the model and scope picker, saves the chosen model with automatic rewriting off, globally or, in a trusted project, locally, and immediately performs the rewrite.
3. If you want eligible answers rewritten automatically, run `/slye on`. Run `/slye off` to stop automatic rewriting while keeping `/slye` available.

| Command | What it does |
| --- | --- |
| `/slye` | Rewrite the latest completed assistant response on demand. |
| `/slye model` | Choose a model without changing a valid automatic on/off state; first-time setup saves automatic rewriting off. Tab switches between scoped and all authenticated eligible models. |
| `/slye on` | Enable automatic rewriting, or choose a model and enable it when no usable model is saved. |
| `/slye off` | Disable automatic rewriting; manual `/slye` remains available. |

SLYE automatically uses the selected model's lowest supported thinking level. Automatic rewriting requires a normally completed final response with at least 200 non-whitespace prose characters outside fenced code. Manual `/slye` uses the same normal-completion, prose, and no-tool-call requirements, but has no 200-character minimum.

### Recommended models

I ran a small, human-scored benchmark (me) to see how different cheap AI models would handle the "translation" part.

But long story short, use cheap-ish, fast models with low/no reasoning (SLYE already sets reasoning for you).

Models that I recommend:

- **Terra** - best overall in this benchmark but not the fastest
- **DeepSeek V4 Flash** - fast, good accuracy
- **GPT-OSS 120B** - cheapest of the three with good overall results, but more sensitive to prompt wording in this small benchmark

## What SLYE guarantees

- The original response stays visible and unchanged. The display-only card never enters LLM context.
- SLYE's rewrite request tells the model to preserve the target response's language and intentional language mix rather than translate it.
- Each target has at most one persistent companion card. A secondary provider request has its own cost and latency and happens only for an automatically eligible response or an eligible, not-yet-completed manual target.
- Escape cancels a rewrite. After 45 seconds or another failure, SLYE leaves the original alone, fails open, and lets you retry manually.
- SLYE sends an isolated, SLYE-controlled payload directly to the selected provider. It does not load project instructions, skills, prompts, tools, files, or the full session history. Other extensions and provider-side processing are outside SLYE's control.

## Evidence

Read the [MVP specification](backlog/docs/specs/doc-1%20-%20SLYE-MVP-specification.md) for the complete behavior and the [benchmark results](backlog/docs/specs/doc-4%20-%20SLYE-benchmark-results.md) for methodology, costs, and limitations.

## Development

Requires Node 24+ and Pi.

```sh
npm ci
npm run check
npm pack --dry-run --json
pi -e .
```

`pi -e .` loads the clone for local testing. Do not submit a prompt when you only need to check that the extension loads.
