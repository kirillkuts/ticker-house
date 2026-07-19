# 042 — React duplicate-key console error in Chat message list

## Bug

Console error (1 of 4 in the overlay): "Encountered two children with the same key, `xTeTEhsnCGVlOtqq`. Keys should be unique…" from `components/Chat.tsx:730` — the `messages.map((m) => <div key={m.id}>…)` loop. Two messages end up sharing an id, so React may duplicate or drop messages.

## Where to look

- Flows that insert messages client-side with generated ids: the seeded category/company chats (task 036), the summarize digest exchange (task 039), and any optimistic message added before the server id arrives. One of them likely reuses an id or inserts the same message twice.
- Dedupe on append, or generate guaranteed-unique ids (crypto.randomUUID) for locally composed messages.

## Done when

Reproducing the flow that triggered it (check all 4 queued console errors, not just the first) shows no duplicate-key warnings and no duplicated/omitted messages in the thread.

## Status
**Status:** done

Resolution: the duplicate id (16-char AI-SDK format, not a local-*/seed-* id)
comes from a resumed trigger session re-delivering a message that initialMessages
already holds. Fix at the choke point: messages from useChat are deduped by id
immediately after the hook (last occurrence wins — freshest state — at the first
occurrence's position), so every consumer (render loop, canvas grouping, save
snapshot, digest) reads unique messages regardless of which flow re-delivers.
Verified (web/scripts/verify-042-ui.mjs): seeded category chat → mid-stream reload
→ resumed ask → summarize digest → reload, with a console listener — zero
"same key" errors and each question renders exactly once.
