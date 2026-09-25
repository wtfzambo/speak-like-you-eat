---
id: doc-3
title: SLYE benchmark procedure
type: guide
created_date: '2026-08-14 02:50'
updated_date: '2026-09-25 18:14'
---
# SLYE benchmark procedure

## Purpose and safety

The published [SLYE benchmark results](../specs/doc-4%20-%20SLYE-benchmark-results.md) are the authoritative reviewed findings; this document remains the reproduction procedure.

This procedure reproduces two completed benchmark phases. Phase one evaluates the exact prompt that was in production at its approved fingerprint across the fixed six-fixture corpus and 18 configurations (108 calls). Phase two evaluates the prompt later promoted to production across three discriminating fixtures and three shortlisted configurations (nine calls). Benchmark-only system-prompt snapshots preserve both historical prompts. Every call uses one user message containing only the selected context and target; no AGENTS, project/session history, tools, or normal agent prompt enters a completion.

`benchmark:dry-run` is safe: it only regenerates `benchmark/manifest.json` and prints the rows, fingerprint, and OpenRouter-equivalent budgets. It does not create the Pi SDK runtime, refresh providers, use the network, or make a model call.

## Review and approve the manifest

From the repository root, run:

```sh
npm run benchmark:dry-run
```

Confirm the output says `Rows: 108`. Review the exact model/thinking rows, the SHA-256 fingerprint, and both budgets. Every row explicitly records `completeSimple`, cache retention `none`, reasoning (`null` when off), Pi `request-max-tokens`, any Haiku high thinking budget, the 8,192 total-output ceiling, and the 45,000 ms deadline. Haiku high has `request-max-tokens=1024` and `haiku-high-thinking-budget=7168`, which total 8,192; every other row has `request-max-tokens=8192` and no custom thinking budget.

`Budget with estimated input and maximum output` uses `ceil(exact Context UTF-8 bytes / 4) + 16` input tokens plus the 8,192 output-token ceiling for every row; it is a ceiling budget, not an expected completion cost. `Conservative maximum OpenRouter-equivalent cost` uses `exact Context UTF-8 bytes + 256` input tokens plus that same output ceiling. Neither estimate invents a typical output or reasoning-token usage.

Do not run the benchmark until the responsible person explicitly approves that exact fingerprint. A changed corpus, matrix, payload, completion option, output cap, deadline, thinking mapping, price model, or price snapshot changes the reviewed manifest; execution-relevant row changes create new call IDs.

## Execute the approved run

Only after approval, run:

```sh
npm run benchmark:run -- --approve <fingerprint>
```

The runner regenerates the manifest and rejects a missing or mismatched approval before it creates a Pi runtime. After approval it obtains the authenticated public Pi `session.modelRuntime` from an empty temporary cwd, `SessionManager.inMemory()`, and `noTools: "all"`; it never calls a Pi agent prompt, sends a session message, or starts an interactive request. Before the first completion, it verifies configured authentication for every provider, every configured model, and the exact thinking mapping without clamping. Calls are sequential. Each has a local 45-second deadline and an 8,192 total-output ceiling.

A timeout is a final recorded result: it proves that candidate missed the product deadline, aborts the current request, and stops this process so no overlapping next request starts. On the next run with the same approved fingerprint, normal resume skips that timeout and advances the matrix. Normal resume also skips every other settled row: a successful row, a non-stop or truncated response recorded as a provider error, and a provider or unknown error. To manually rerun any settled row, delete that exact local result file in `benchmark/.work/`; do not expect normal resume to retry it.

A user cancellation remains retryable and stops the current process. Thrown aborted, authentication, and rate-limit failures also stop and remain retryable on resume. Provider and unknown errors remain recorded and allow later rows to run. Settled saved usage is priced again using the current manifest price snapshot rather than trusting a stored cost. Results, the blind report, and the candidate mapping are local ignored files under `benchmark/.work/`. They contain final text and sanitized usage only; do not add credentials, request/response IDs, headers, provider diagnostics, or reasoning content.

## Blind review, reveal, and publication

Create the local blind review after results exist:

```sh
npm run benchmark:report
```

The report rebuilds the current manifest and loads only local result filenames whose call IDs belong to that manifest before parsing them. Old ignored result files from earlier fingerprints are excluded, so removed fixtures cannot enter or break the report. The first report cryptographically shuffles candidate labels in the local ignored mapping. Later reports preserve those labels and only add labels for new candidates.

The report is grouped by corpus fixture in corpus order. Each fixture shows its selected context and exact source target once, then its outputs in anonymized Candidate-label order with elapsed time, available token usage, OpenRouter-equivalent cost, and mechanical checks. It contains no model, provider, or thinking identity. Source and output are isolated in fences so model Markdown cannot change report structure.

Review the anonymized outputs against the rubric: simplification, cliché removal, semantic and factual fidelity, English fidelity, Markdown/code preservation, and unwanted preambles. Mechanical checks are evidence only; they do not prove semantic quality. Keep the mapping hidden until all human scoring is complete. Then reveal `benchmark/.work/blind-map.json`, summarize the evidence and recommendations, and publish only the reviewed aggregate findings. Any prompt change or follow-up benchmark needs separate approval and budget review.

## Phase-two prompt follow-up

Phase one completed 108/108 calls and a locked blind human review. It showed that the backup-cliché, inflated-prose, and clear-control fixtures carried most quality differentiation; code, Markdown, literal, and injection fixtures mainly validated safety. Phase two therefore compares one evidence-based prompt variant only on those three fixtures and only with Terra off, GPT-OSS 120B low, and DeepSeek V4 off. Existing phase-one outputs remain the baseline and are not called again.

The phase-two prompt kept the then-current production prompt and inserted three exact evidence-based instructions immediately before the final output-only instruction. `benchmark/phase-2-manifest.json` fingerprints the complete prompt, variant ID, phase-one baseline fingerprint, ordered fixture IDs, ordered candidate IDs, isolated payload hashes, completion options, price snapshot, and budgets. The phase-two snapshot records the prompt tested at that time; production has since evolved. The benchmark keeps both historical system prompts and the original Context/Target user-message framing independent of the production request builder, so later production prompt changes cannot rewrite historical fingerprints or call IDs.

The setup approval does not approve model calls. Review the no-call manifest with:

```sh
npm run benchmark:phase-2:dry-run
```

Confirm the output prints prompt variant `phase-2-evidence-based-plainness-v1`, the complete prompt, exactly nine rows, fingerprint `59fc67e920727f25b40b1fd874cda6b51aff9f98426ae09af27275a4fda96728`, estimated-input/output-ceiling budget USD 0.15991218, and conservative maximum OpenRouter-equivalent budget USD 0.16476768. A changed prompt, subset, payload, option, price, or limit changes the fingerprint. Do not execute phase two until the responsible person explicitly approves that exact fingerprint and conservative budget.

Only after that approval, run:

```sh
npm run benchmark:phase-2:run -- --approve <fingerprint>
```

Phase two uses the same preflight, sequential execution, deadline, output ceiling, sanitized persistence, settlement, resume, and stop rules as phase one. Its ignored results are isolated under `benchmark/.work/phase-2/`; phase-one results and blind mapping remain untouched.

After all nine rows settle, create the separate blind report with:

```sh
npm run benchmark:phase-2:report
```

Review and lock the nine quality scores before revealing `benchmark/.work/phase-2/blind-map.json`. Compare the reviewed results against the matching phase-one baseline rows.

The approved run completed 9/9 rows with normal stop. Provider-reported usage was 2,784 input tokens, 702 output tokens, zero reasoning tokens, and 3,486 total tokens; usage-based OpenRouter-equivalent cost was USD 0.00238211. Blind scores were locked at SHA-256 `87381478f7a4fefb409b75bf720b599dda31328dcdf43a8e79c9f8a58e85e585` before identity reveal. Every fidelity and safety score was 2.

On the three matched fixtures, Terra off mean quality improved from 1.667 to 2.000, GPT-OSS 120B low declined from 1.667 to 1.500, and DeepSeek V4 off improved from 1.333 to 1.500. Overall mean quality improved from 1.556 to 1.667. Terra alone fully fixed the backup-cliché case, so the prompt effect is positive overall but model-dependent.

Final guidance from both phases is: Terra off for quality; DeepSeek V4 off for lower latency, measured at roughly one-third of Terra; avoid spending on higher thinking for this rewrite task because it did not reliably help. GPT-OSS 20B was tested at low and high across all six fixtures: low was fast but lower quality, while high increased mean latency from about 1.7 seconds to about 17.2 seconds for only a small quality gain. GPT-OSS 120B low remained a useful phase-one value candidate but regressed slightly with the promoted prompt. These measurements come from a small fixed corpus and are comparative evidence, not universal provider guarantees.
