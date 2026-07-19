# 003 — Chat header should match home page styling

**Status:** todo

From user screenshot (arrow at "Ticker House" title in chat view): the chat view's top UI doesn't match the home page. Home has a big centered hero ("Get an interactive answer.") with a distinct visual language; the chat view has a small left-aligned "Ticker House" title + "+ New chat" button that looks like a different app.

Wanted:
- One consistent header/brand treatment across home and chat (same logo/wordmark styling, spacing, typography).
- Ideally a shared header component: brand on the left (links to `/`), actions ("+ New chat", later chat history) on the right.

Files: web/components/Chat.tsx (chat header), web/components/HomeScreen.tsx, web/app/layout.tsx (candidate place for a shared header).

Done when: navigating home → chat feels like the same product; header is a shared component used by both.
