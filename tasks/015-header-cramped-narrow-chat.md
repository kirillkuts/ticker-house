# 015 — Header runs out of space in the narrow chat column

**Status:** done

Resolution: the Header is now a CSS container (`@container`, Tailwind v4 built-in) since the chat column width is drag-dependent. Below 24rem container width the wordmark hides (logo alone links home); below 32rem the action buttons go icon-only — "Chats" collapses to a chat-bubble icon, "+ New chat" to "+", "▦ Canvas (n)" to "▦ (n)" — all with tooltips. Verified the generated CSS contains the container-type and both min-width rules; typecheck passes. Drag the divider to 75% to see the compact form.

From user screenshot (arrow at the header, canvas open): with the canvas taking ~half the viewport, the chat column header is cramped — "Ticker House" wordmark, "Chats" and "+ New chat" sit shoulder to shoulder with no breathing room, and the buttons visually crowd the brand.

Wanted: the header must fit comfortably at narrow chat-column widths.
Options (pick what looks best, can combine):
- Compact the action buttons when space is tight: icon-only ("🗨" history, "+" new chat) with tooltips, expanding to labels when the column is wide.
- Hide the wordmark (keep the logo) below a width threshold — the logo alone still links home.
- Tighter paddings/gaps for the in-chat header vs the home header.
- Watch for the same crowding with the "▦ Canvas (n)" button when the canvas is closed.

Files: web/components/Header.tsx, web/components/Chat.tsx (header usage in the chat column), possibly container queries/Tailwind breakpoints — note the chat column width is dynamic (canvas divider drags 25–75%), so a container query fits better than a viewport breakpoint.

Done when: with the canvas open at its default width, the header shows brand + actions without wrapping or crowding, and dragging the divider to 75% canvas still leaves a usable header.
