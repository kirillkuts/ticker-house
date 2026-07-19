# 013 — Pick the model per question: chips run on fast Haiku

**Status:** done

Resolution: per-turn metadata rides `sendMessage(msg, { metadata })` and arrives in the agent run as `clientData` (validated by a new `clientDataSchema`). All pre-prompted paths send `{ speed: "fast" }`: FollowUps chips and TickerButton (via `ask(text, { fast: true })`), home suggestion pills, and the tile-click fallback. The agent picks `anthropic/claude-haiku-4.5` for fast turns, `anthropic/claude-sonnet-5` otherwise; missing/unknown metadata falls back to default. Typed composer questions carry no metadata. Typecheck passes; needs the Trigger dev worker to reload before a live chip click shows the speedup.

From user: "can i choose model based on the question? for example make it so that clicking pre-prompted questions kicks off fast haiku".

Idea: pre-prompted questions (follow-up chips, model-suggested chips, home suggestion pills) are already structured to map directly onto view tools (task 005), so they don't need Sonnet — route them to a small fast model. Typed free-form questions keep the default model.

Wanted:
- Chip/suggestion clicks send per-turn metadata marking the source (e.g. `{ model: "fast" }` or `{ source: "chip" }`): `ask()` in web/components/Chat.tsx needs a source flag threaded from FollowUps/TickerButton (web/components/widgets/FollowUps.tsx), suggested-chip renders, and HomeScreen suggestion pills. useChat's `sendMessage(msg, { metadata })` + the Trigger transport merge metadata into each turn.
- In web/trigger/chat.ts, read the per-turn metadata in the agent run and pick the model: `anthropic/claude-haiku-4.5` for chip-sourced turns, `anthropic/claude-sonnet-5` otherwise. Investigate how chat.agent exposes per-turn metadata to run (check node_modules/@trigger.dev/sdk chat-server / ai-shared .d.ts; `clientDataSchema` and per-turn metadata on `.in` chunks — the SDK docs use `metadata: { model }` as the canonical model-selection example).
- Guard: unknown/missing metadata → default model. Log/annotate nothing user-visible.

Files: web/trigger/chat.ts, web/components/Chat.tsx, web/components/widgets/FollowUps.tsx, web/components/HomeScreen.tsx.

Done when: clicking any chip produces a noticeably faster widget answer via Haiku, while typed questions still run on Sonnet; a chip-clicked chat continues to work when the next question is typed.
