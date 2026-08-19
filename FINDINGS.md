# Findings

## 2026-08-18 — Companion output styles did not justify their complexity

**Hypothesis.** Curated output styles inside the SLYE companion would add enough distinct user value to justify their config, commands, prompt branches, tests, benchmark, and maintenance complexity.

**Evidence.** An explicitly approved but never-merged local experiment ran 48 rows (four proposed styles × four fixtures × Terra off, DeepSeek off, GPT-OSS 120B low), manifest fingerprint `ea97236150fa1f4c9cb55133d9f065a2b1ec66a4c246a0a986c6d41818ca6125`. Blind score SHA-256 `730bc3aef51e398698b1ea80a4b0532cb32e905c52a2b37065b882b00b380142`. Raw checksum-manifest SHA-256 `933bb018ae785fc5b8ef91fee62ea796fda95fb8eed9ae1dd0fe71ad203bdce8`. The operator's qualitative review of Terra outputs found only `concise` produced clear added value; `structured` and `action-first` did not. The frozen blind gates also found DeepSeek action-first translated an Italian target, GPT-OSS plain corrupted a protected URL, and GPT-OSS structured averaged 1.25 Style adherence. Local ignored evidence remains under `benchmark/.work/styles/`, including `archive/style-manifest.json`; the feature branch was deleted without merge.

**Practical consequence.** Keep SLYE single-purpose as a plain-language companion. When users want output styles, compose a dedicated output-style extension on the original response before SLYE instead of adding a second style system inside SLYE. Do not retry companion styles without materially new evidence.

**Links.** [SLYE MVP specification](backlog/docs/specs/doc-1%20-%20SLYE-MVP-specification.md)
