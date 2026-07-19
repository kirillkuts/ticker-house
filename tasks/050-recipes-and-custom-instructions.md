# 050 — Briefing recipes + custom instructions (021 phase 5)

**Status:** done

Depends on 049 (rides with it). Personalization shapes presentation and emphasis in
layer 2 only — never the shared layer-1 analysis.

## Recipes

Three predefined recipes shipped as plain-text prompt templates the user can read and
copy: long-term fundamentals, dividend income, swing trader. Decided: `recipe_key` and
`custom_instructions` live as columns on `users` (per-user, not per-watchlist-entry;
added via ALTER TABLE IF NOT EXISTS in ensureSchema). `custom_instructions`
overrides/extends the recipe; it is the power-user escape hatch.

## UI

Recipe picker + instructions editor near the watchlist (home Watching section header or
the briefing page once 051 exists). Templates are visible in full — readable prompts,
not black boxes.

## Done when

Two users watching the same stock on the same day get the same underlying facts with
different emphasis matching their recipes (verified by running layer 2 for both).
Custom instructions visibly change the output. An empty recipe/instructions falls back
to the default assembly.
