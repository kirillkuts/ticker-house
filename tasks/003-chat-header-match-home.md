# 003 — Chat header should match home page styling

**Status:** done

Resolution: new shared `components/Header.tsx` — logo + wordmark on the left (always links to `/`), contextual actions on the right. Chat view uses it with the canvas toggle and "+ New chat"; home shows it above the hero, and the hero's duplicate logo row was removed (the Logo svg moved from HomeScreen into Header). Verified: header renders on home, typecheck passes.

From user screenshot (arrow at "Ticker House" title in chat view): the chat view's top UI doesn't match the home page. Home has a big centered hero ("Get an interactive answer.") with a distinct visual language; the chat view has a small left-aligned "Ticker House" title + "+ New chat" button that looks like a different app.

Wanted:
- One consistent header/brand treatment across home and chat (same logo/wordmark styling, spacing, typography).
- Ideally a shared header component: brand on the left (links to `/`), actions ("+ New chat", later chat history) on the right.

Files: web/components/Chat.tsx (chat header), web/components/HomeScreen.tsx, web/app/layout.tsx (candidate place for a shared header).

Done when: navigating home → chat feels like the same product; header is a shared component used by both.
