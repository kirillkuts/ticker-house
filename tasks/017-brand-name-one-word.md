# 017 — Brand name written together: "TickerHouse"

**Status:** done

Resolution: all user-visible occurrences now read "TickerHouse" — header wordmark and link title, layout metadata title, transcript speaker label ("tickerhouse"), and the agent identity in the system prompt. Internal ids (ticker-chat, ticker_house db) untouched. Verified live: home page renders only "TickerHouse"; typecheck passes.

From user screenshot (arrow at the "Ticker House" wordmark on the home header): the brand should be written as one word — "TickerHouse", not "Ticker House".

Where it appears:
- Header wordmark (web/components/Header.tsx).
- Page metadata title/description (web/app/layout.tsx).
- Chat transcript speaker label "ticker house" (web/components/Chat.tsx).
- Header link title attribute ("Ticker House home").
- Agent identity in the system prompt ("You are Ticker House", web/trigger/chat.ts).
- Any other user-visible copy (grep for "Ticker House").

Internal ids ("ticker-chat" task id, ticker_house database) stay unchanged.

Done when: every user-visible occurrence reads "TickerHouse" (transcript label lowercase variant: "tickerhouse").
