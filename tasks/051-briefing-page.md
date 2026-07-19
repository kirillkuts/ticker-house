# 051 — Briefing page (021 phase 6)

**Status:** planned

Depends on 049. Email delivery is explicitly out of scope for v1.

## Route

`/briefing`: today's briefing for the signed-in user with a per-stock section list.
Each section links the underlying filing (EDGAR url from the brief's citations) and the
existing widgets for that stock (price chart / fundamentals — reuse the dashboard
recipe-runner or the instant-overview path). Date switcher for history, same pattern as
canvas history: pick a past briefing_date, render that row.

Auth-gated like every other page (redirect to /login). A user with no briefing rows
yet gets a friendly empty state pointing at the watchlist star.

## Done when

A user with briefings sees today's by default, can switch to a past date, can click
through to a cited filing on EDGAR, and can open a stock's widgets from its section.
A fresh user sees the empty state. Nothing breaks logged out (redirect).
