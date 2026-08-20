---
id: decision-3
title: Default model setup to manual rewrites and identify companions by target
date: '2026-08-20 17:45'
status: accepted
---
## Context

A Reddit user asked for a manual rewrite trigger. Automatic-only rewriting made a selected model immediately active, while command contexts require an explicit cancellable interaction. Automatic events, manual requests, and resumed sessions could also create duplicate companions for the same response.

## Decision

New or repaired model setup is manual-first: it saves `enabled: false`, and `enabled` controls automatic rewriting only. `/slye` performs one on-demand rewrite; `/slye on` enables automatic rewriting. SLYE identifies each persistent companion by its target response, while recognizing legacy display-only cards on resume. Manual and automatic rewrites use the same rewrite contract. No benchmark is required because the prompt is unchanged.

## Consequences

Existing users with `enabled: true` remain automatic; new users must explicitly opt into automatic rewriting. A secondary provider call happens only for an automatically eligible target or an eligible not-yet-completed manual target. Companion-card metadata expands compatibly, and lifecycle tests and state coordination increase. Release work remains separate.
