"use client";

import { useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import ReactMarkdown from "react-markdown";
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react";
import type { tickerChat, ChatUIMessage } from "@/trigger/chat";
import type { SingleStockPriceData, FundamentalsData } from "@/lib/views";
import { mintChatAccessToken, startChatSession } from "@/app/actions";
import type { MetricQueryResult } from "@/lib/metric-query";
import { SingleStockPrice } from "./widgets/SingleStockPrice";
import { Fundamentals } from "./widgets/Fundamentals";
import { MetricResult } from "./widgets/MetricResult";

type Part = ChatUIMessage["parts"][number];

function ToolPart({ part }: { part: Part }) {
  if (part.type === "tool-show_price_chart" && part.state === "output-available") {
    const out = part.output as SingleStockPriceData | { error: string };
    if ("error" in out) return <div className="text-sm text-red-500">{out.error}</div>;
    return <SingleStockPrice data={out} />;
  }
  if (part.type === "tool-show_fundamentals" && part.state === "output-available") {
    const out = part.output as FundamentalsData | { error: string };
    if ("error" in out) return <div className="text-sm text-red-500">{out.error}</div>;
    return <Fundamentals data={out} />;
  }
  if (part.type === "tool-query_metrics" && part.state === "output-available") {
    const out = part.output as MetricQueryResult | { error: string };
    if ("error" in out) return <div className="text-sm text-red-500">{out.error}</div>;
    return <MetricResult data={out} />;
  }
  if (part.type.startsWith("tool-")) {
    return <div className="text-xs text-neutral-400 animate-pulse">loading view…</div>;
  }
  return null;
}

// A tool part that produced a renderable view (successful output, not an error).
function isViewPart(part: Part): boolean {
  return (
    part.type.startsWith("tool-") &&
    "state" in part &&
    part.state === "output-available" &&
    !(part.output && typeof part.output === "object" && "error" in (part.output as object))
  );
}

// Short label for an artifact chip, derived from what the views show.
function artifactTitle(parts: Part[]): string {
  const tickers = new Set<string>();
  for (const p of parts) {
    if (!("output" in p) || !p.output || typeof p.output !== "object") continue;
    const out = p.output as { ticker?: string; rows?: { ticker?: unknown }[] };
    if (out.ticker) tickers.add(out.ticker);
    else if (Array.isArray(out.rows)) out.rows.forEach((r) => r.ticker && tickers.add(String(r.ticker)));
  }
  const t = [...tickers];
  const who = t.length === 0 ? "" : t.length <= 3 ? t.join(", ") : `${t.slice(0, 3).join(", ")} +${t.length - 3}`;
  return who ? `Dashboard · ${who}` : "Dashboard";
}

interface Artifact {
  id: string; // message id
  title: string;
  parts: Part[];
}

export function Chat() {
  const transport = useTriggerChatTransport<typeof tickerChat>({
    task: "ticker-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) => startChatSession({ chatId, clientData }),
  });

  const { messages, sendMessage, stop, status } = useChat<ChatUIMessage>({ transport });
  const [input, setInput] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  // A message whose successful views number 2+ becomes an artifact.
  const artifacts: Artifact[] = messages
    .filter((m) => m.role === "assistant")
    .map((m) => ({ id: m.id, parts: m.parts.filter(isViewPart) }))
    .filter((a) => a.parts.length >= 2)
    .map((a) => ({ ...a, title: artifactTitle(a.parts) }));

  const latestId = artifacts[artifacts.length - 1]?.id ?? null;
  // Follow the newest artifact as it appears (streaming included).
  useEffect(() => {
    if (latestId) setActiveId(latestId);
  }, [latestId]);

  const active = artifacts.find((a) => a.id === activeId) ?? null;
  const artifactIds = new Set(artifacts.map((a) => a.id));

  return (
    <div className="flex min-h-screen">
      <div className={`mx-auto p-4 flex flex-col gap-4 min-h-screen w-full ${active ? "max-w-xl" : "max-w-3xl"}`}>
        <h1 className="text-xl font-semibold">Ticker House</h1>

        <div className="flex-1 space-y-4">
          {messages.length === 0 && (
            <p className="text-neutral-500 text-sm">
              Ask about a stock — “How is NVDA doing?”, “Apple quarterly revenue”.
            </p>
          )}
          {messages.map((m) => {
            const isArtifact = artifactIds.has(m.id);
            let chipShown = false;
            return (
              <div key={m.id}>
                <div className="text-xs uppercase tracking-wide text-neutral-400 mb-1">
                  {m.role === "user" ? "you" : "ticker house"}
                </div>
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <div key={i} className="prose-chat text-sm leading-relaxed space-y-2">
                        <ReactMarkdown>{part.text}</ReactMarkdown>
                      </div>
                    );
                  }
                  if (isArtifact && isViewPart(part)) {
                    if (chipShown) return null;
                    chipShown = true;
                    const artifact = artifacts.find((a) => a.id === m.id)!;
                    const isOpen = activeId === m.id;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActiveId(m.id)}
                        className={`my-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                          isOpen
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                            : "border-neutral-200 dark:border-neutral-800 hover:border-blue-400"
                        }`}
                      >
                        <span className="text-base">▦</span>
                        <span className="font-medium">{artifact.title}</span>
                        <span className="text-neutral-500">{artifact.parts.length} views</span>
                      </button>
                    );
                  }
                  return <ToolPart key={i} part={part} />;
                })}
              </div>
            );
          })}
        </div>

        <form
          className="sticky bottom-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim()) return;
            sendMessage({ text: input });
            setInput("");
          }}
        >
          <input
            className="flex-1 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-2 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a stock…"
          />
          {status === "streaming" ? (
            <button type="button" onClick={() => stop()} className="rounded-xl border px-4 py-2 text-sm">
              Stop
            </button>
          ) : (
            <button type="submit" className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm">
              Ask
            </button>
          )}
        </form>
      </div>

      {active && (
        <aside className="hidden md:flex w-[52%] max-w-4xl flex-col border-l border-neutral-200 dark:border-neutral-800">
          <div className="sticky top-0 flex h-screen flex-col">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
              <div className="font-medium text-sm">{active.title}</div>
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="text-neutral-400 hover:text-neutral-600 text-sm"
                aria-label="Close canvas"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {active.parts.map((part, i) => (
                <ToolPart key={i} part={part} />
              ))}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
