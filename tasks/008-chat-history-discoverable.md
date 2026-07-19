# 008 — Make chat history discoverable

**Status:** todo

From user: "how do i see a history of my chats" — the recent-chats list exists (home page, under the suggestion chips, added in task 002) but the user didn't find it. History must be reachable from anywhere, not just the empty home screen.

Wanted:
- A "History" affordance in the shared Header (web/components/Header.tsx) visible in BOTH home and chat views — e.g. a "Chats" button that opens a dropdown/panel listing recent chats (title + relative time, from `recentChats()` in web/lib/chats.ts), each linking to /chat/<id>.
- Keep the home-screen list too; this adds the always-visible entry point.
- Data: home/chat pages already load `recent` server-side; thread it into the Header, or fetch via a server action on open.

Files: web/components/Header.tsx, web/components/Chat.tsx, web/components/HomeScreen.tsx, web/lib/chats.ts.

Done when: from inside any chat, one click in the header shows past chats and clicking one opens it.
