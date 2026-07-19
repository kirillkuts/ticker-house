"use client";

import { createContext, useContext } from "react";

// Chat provides ask() so any widget — rendered inline or on the canvas — can
// send a follow-up question as if the user typed it. Without a provider
// (static renders, previews) the interactive affordances hide themselves.
export const AskContext = createContext<{
  ask: ((text: string) => void) | null;
  busy: boolean;
}>({ ask: null, busy: false });

// Follow-up chips under a widget section: each click sends the prompt to the
// chat, so every part of a dashboard leads somewhere.
export function FollowUps({ asks }: { asks: { label: string; prompt: string }[] }) {
  const { ask, busy } = useContext(AskContext);
  if (!ask || asks.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      {asks.map((a) => (
        <button
          key={a.label}
          type="button"
          disabled={busy}
          onClick={() => ask(a.prompt)}
          title={a.prompt}
          className="rounded-full border border-neutral-200 dark:border-neutral-800 px-2.5 py-1 text-[11px] text-neutral-500 dark:text-neutral-400 transition-colors enabled:hover:border-blue-400 enabled:hover:text-blue-600 dark:enabled:hover:text-blue-400 disabled:opacity-50"
        >
          {a.label} →
        </button>
      ))}
    </div>
  );
}

// A ticker that opens that company's full overview on click.
export function TickerButton({ ticker }: { ticker: string }) {
  const { ask, busy } = useContext(AskContext);
  if (!ask) return <>{ticker}</>;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => ask(`Give me the full overview of ${ticker}`)}
      title={`Open the full ${ticker} overview`}
      className="underline decoration-dotted underline-offset-2 decoration-neutral-400 transition-colors enabled:hover:text-blue-600 dark:enabled:hover:text-blue-400"
    >
      {ticker}
    </button>
  );
}
