"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import ReactMarkdown from "react-markdown";
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react";
import type { tickerChat, ChatUIMessage } from "@/trigger/chat";
import type { SingleStockPriceData, FundamentalsData, CompanyOverviewData, HomeTicker } from "@/lib/views";
import type { RecentChat } from "@/lib/chats";
import { mintChatAccessToken, startChatSession, saveChatAction, fetchCompanyOverview } from "@/app/actions";
import type { MetricQueryResult } from "@/lib/metric-query";
import { SingleStockPrice } from "./widgets/SingleStockPrice";
import { Fundamentals } from "./widgets/Fundamentals";
import { MetricResult } from "./widgets/MetricResult";
import { CompanyOverview } from "./widgets/CompanyOverview";
import { AskContext, FollowUps } from "./widgets/FollowUps";
import { Header } from "./Header";
import { ChatHistory } from "./ChatHistory";
import { HomeScreen } from "./HomeScreen";

type Part = ChatUIMessage["parts"][number];

// A failed view must not be a dead end: name the problem, offer a way out.
function ToolError({ error, ticker }: { error: string; ticker?: string }) {
  const tk = ticker?.toUpperCase();
  return (
    <div className="my-2 space-y-1 rounded-xl border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/30 p-3">
      <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      <FollowUps
        asks={[
          ...(tk && (error.includes("show_price_chart") || error.includes("No fundamentals loaded"))
            ? [{ label: `${tk} price chart`, prompt: `Show ${tk}'s price chart for the last month` }]
            : []),
          { label: "What's covered?", prompt: "Which companies do you cover with full fundamentals?" },
        ]}
      />
    </div>
  );
}

function ToolPart({ part }: { part: Part }) {
  if (part.type === "tool-show_company_overview" && part.state === "output-available") {
    const out = part.output as CompanyOverviewData | { error: string };
    if ("error" in out)
      return <ToolError error={out.error} ticker={(part.input as { ticker?: string } | undefined)?.ticker} />;
    return <CompanyOverview data={out} />;
  }
  if (part.type === "tool-show_price_chart" && part.state === "output-available") {
    const out = part.output as SingleStockPriceData | { error: string };
    if ("error" in out)
      return <ToolError error={out.error} ticker={(part.input as { ticker?: string } | undefined)?.ticker} />;
    return <SingleStockPrice data={out} />;
  }
  if (part.type === "tool-show_fundamentals" && part.state === "output-available") {
    const out = part.output as FundamentalsData | { error: string };
    if ("error" in out)
      return <ToolError error={out.error} ticker={(part.input as { ticker?: string } | undefined)?.ticker} />;
    return <Fundamentals data={out} />;
  }
  if (part.type === "tool-query_metrics" && part.state === "output-available") {
    const out = part.output as MetricQueryResult | { error: string };
    if ("error" in out) return <ToolError error={out.error} />;
    return <MetricResult data={out} />;
  }
  if (part.type === "tool-suggest_follow_ups") {
    // Model-generated next questions, rendered as the same chips widgets use.
    if (part.state !== "output-available") return null;
    const out = part.output as { suggestions?: { label: string; prompt: string }[] } | undefined;
    if (!out?.suggestions?.length) return null;
    return <div className="my-2"><FollowUps asks={out.suggestions} /></div>;
  }
  if (part.type === "tool-edit_canvas") {
    return part.state === "output-available" ? (
      <div className="text-xs text-neutral-400 my-1">▦ canvas updated</div>
    ) : null;
  }
  if (part.type.startsWith("tool-")) {
    return <div className="text-xs text-neutral-400 animate-pulse">loading view…</div>;
  }
  return null;
}

const TOOL_LABELS: Record<string, string> = {
  "tool-show_company_overview": "Company overview",
  "tool-show_price_chart": "Price chart",
  "tool-show_fundamentals": "Fundamentals",
  "tool-query_metrics": "Metrics",
};

// Human/model-readable one-liner for a view, used in chips and the [canvas] block.
function describePart(part: Part): string {
  const tool = TOOL_LABELS[part.type] ?? part.type.replace("tool-", "");
  const t = partTickers(part);
  const tickers = t.length <= 3 ? t.join(", ") : `${t.slice(0, 3).join(", ")} +${t.length - 3}`;
  let qualifier = "";
  if ("output" in part && part.output && typeof part.output === "object") {
    const out = part.output as { range?: string; periodType?: string; spec?: { period?: string; metrics?: string[] } };
    if (out.range) qualifier = out.range;
    else if (out.periodType) qualifier = out.periodType;
    else if (out.spec) {
      const m = out.spec.metrics ?? [];
      qualifier = [out.spec.period, m.length > 3 ? `${m.slice(0, 3).join(", ")} +${m.length - 3}` : m.join(", ")]
        .filter(Boolean)
        .join(" · ");
    }
  }
  return [tool, tickers, qualifier].filter(Boolean).join(" · ");
}

const CANVAS_BLOCK_RE = /\n*\[canvas\][\s\S]*$/;

// Any view-producing tool part, regardless of completion state.
function isViewToolPart(part: Part): boolean {
  return (
    part.type.startsWith("tool-") &&
    part.type !== "tool-edit_canvas" &&
    part.type !== "tool-suggest_follow_ups"
  );
}

// A tool part whose output failed (view tools return { error } instead of throwing).
function isErrorPart(part: Part): boolean {
  return (
    "state" in part &&
    part.state === "output-available" &&
    Boolean(part.output && typeof part.output === "object" && "error" in (part.output as object))
  );
}

// A tool part that produced a renderable view (successful output, not an error).
function isViewPart(part: Part): boolean {
  return isViewToolPart(part) && "state" in part && part.state === "output-available" && !isErrorPart(part);
}

function partTickers(part: Part): string[] {
  if (!("output" in part) || !part.output || typeof part.output !== "object") return [];
  const out = part.output as { ticker?: string; rows?: { ticker?: unknown }[] };
  if (out.ticker) return [out.ticker];
  if (Array.isArray(out.rows)) return [...new Set(out.rows.map((r) => String(r.ticker ?? "")).filter(Boolean))];
  return [];
}

function canvasTitle(parts: Part[]): string {
  const tickers = [...new Set(parts.flatMap(partTickers))];
  const who =
    tickers.length === 0 ? "" : tickers.length <= 3 ? tickers.join(", ") : `${tickers.slice(0, 3).join(", ")} +${tickers.length - 3}`;
  return who ? `Canvas · ${who}` : "Canvas";
}

// Full-dashboard views: even a single one auto-opens on the canvas instead of
// swallowing the chat column. Metric tables and chips stay inline.
const BIG_VIEW_TYPES = new Set([
  "tool-show_company_overview",
  "tool-show_price_chart",
  "tool-show_fundamentals",
]);

// A view on the canvas, identified by its position in the message list so we
// always render from the live message parts.
interface ViewRef {
  msgId: string;
  partIdx: number;
}
const refKey = (r: ViewRef) => `${r.msgId}:${r.partIdx}`;

// One canvas per dashboard answer: the views one assistant message produced,
// labeled by the question that triggered it.
interface CanvasGroup {
  id: string; // the assistant message id
  label: string;
  entries: { ref: ViewRef; part: Part }[];
}

export function Chat({
  home = [],
  recent = [],
  chatId: routeChatId,
  initialMessages = [],
}: {
  home?: HomeTicker[];
  recent?: RecentChat[];
  chatId?: string;
  initialMessages?: ChatUIMessage[];
}) {
  const transport = useTriggerChatTransport<typeof tickerChat>({
    task: "ticker-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) => startChatSession({ chatId, clientData }),
  });

  // A chat is addressable from birth: the id comes from the /chat/[id] route
  // when revisiting, or is minted here for a fresh conversation.
  const [chatId] = useState(() => routeChatId ?? crypto.randomUUID());
  const { messages, sendMessage, setMessages, stop, status } = useChat<ChatUIMessage>({
    id: chatId,
    messages: initialMessages,
    transport,
  });

  // A covered-company tile is a known question with a known answer: fetch the
  // overview directly and inject the exchange as messages, skipping the agent
  // roundtrip. The agent's server-side history won't contain this exchange —
  // the [canvas] block on the next question tells it what's on screen.
  const instantOverview = async (ticker: string) => {
    const text = `Give me the full overview of ${ticker}`;
    try {
      const out = await fetchCompanyOverview(ticker);
      if (out && typeof out === "object" && "error" in out) throw new Error(out.error);
      const stamp = Date.now();
      setMessages((prev) => [
        ...prev,
        { id: `local-u-${stamp}`, role: "user" as const, parts: [{ type: "text" as const, text }] },
        {
          id: `local-a-${stamp}`,
          role: "assistant" as const,
          parts: [
            {
              type: "tool-show_company_overview" as const,
              toolCallId: `local-call-${stamp}`,
              state: "output-available" as const,
              input: { ticker },
              output: out,
            },
          ],
        },
      ]);
    } catch {
      sendMessage({ text }); // no direct data — let the agent handle it
    }
  };

  // As soon as the conversation exists, move the URL to its permanent home
  // without a navigation (a router push would remount and drop the stream).
  const hasMessages = messages.length > 0;
  useEffect(() => {
    if (hasMessages && !window.location.pathname.startsWith("/chat/")) {
      window.history.replaceState(null, "", `/chat/${chatId}`);
    }
  }, [hasMessages, chatId]);

  // Persist a full snapshot after each completed turn. Tool outputs ride along
  // in the message parts, so a restore re-renders every widget with no refetch.
  const savedCount = useRef(initialMessages.length);
  useEffect(() => {
    if (status !== "ready" || messages.length === 0 || messages.length === savedCount.current) return;
    savedCount.current = messages.length;
    const firstUserText =
      messages
        .find((m) => m.role === "user")
        ?.parts.find((p): p is Extract<Part, { type: "text" }> => p.type === "text")
        ?.text.replace(CANVAS_BLOCK_RE, "") ?? "New chat";
    saveChatAction(chatId, firstUserText.slice(0, 120), JSON.stringify(messages)).catch(() => {});
  }, [status, messages, chatId]);
  const [input, setInput] = useState("");
  // Canvases derive from message parts — one per dashboard answer — so
  // switching between them never refetches, and a restored chat rebuilds its
  // whole canvas history. Two overlays hold the user's edits: view keys
  // removed from canvases, and view keys manually pinned onto them.
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());
  const [pinnedKeys, setPinnedKeys] = useState<Set<string>>(new Set());
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [canvasOpen, setCanvasOpen] = useState(false);
  // Canvas width as % of the viewport, adjustable by dragging the divider.
  const [canvasPct, setCanvasPct] = useState(52);
  const dragging = useRef(false);

  useEffect(() => {
    const saved = Number(localStorage.getItem("canvasPct"));
    if (saved >= 25 && saved <= 75) setCanvasPct(saved);
  }, []);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return;
      const pct = Math.min(75, Math.max(25, ((window.innerWidth - ev.clientX) / window.innerWidth) * 100));
      setCanvasPct(pct);
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setCanvasPct((pct) => {
        localStorage.setItem("canvasPct", String(pct));
        return pct;
      });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Group view parts into canvases, one per assistant message. The FIRST
  // canvas is born from an answer that reads as a dashboard — 2+ view calls
  // or a single BIG widget. From then on the chat is in canvas mode: every
  // later answer with any view gets its own canvas, no matter how small.
  // A message whose canvas the model edited itself is exempt (its edit wins),
  // and user-pinned views always materialize a canvas. Counting CALLS (not
  // finished outputs) moves views over as soon as the call starts; pending
  // views stay as placeholders, errors drop out.
  const canvases: CanvasGroup[] = [];
  messages.forEach((m, mi) => {
    if (m.role !== "assistant") return;
    const views = m.parts
      .map((p, i) => ({ part: p, ref: { msgId: m.id, partIdx: i } }))
      .filter((x) => isViewToolPart(x.part));
    if (views.length === 0) return;
    const modelEdited = m.parts.some((p) => p.type === "tool-edit_canvas");
    const canvasMode = canvases.length > 0;
    const qualifies =
      !modelEdited &&
      (canvasMode || views.length >= 2 || views.some((x) => BIG_VIEW_TYPES.has(x.part.type)));
    const entries = views.filter(
      (x) => (qualifies || pinnedKeys.has(refKey(x.ref))) && !removedKeys.has(refKey(x.ref)) && !isErrorPart(x.part),
    );
    if (entries.length === 0) return;
    // Label by the question that triggered this answer; lead tickers as backup.
    let label = "";
    for (let i = mi - 1; i >= 0; i--) {
      const prev = messages[i];
      if (prev.role !== "user") continue;
      label = (prev.parts.find((p): p is Extract<Part, { type: "text" }> => p.type === "text")?.text ?? "")
        .replace(CANVAS_BLOCK_RE, "")
        .trim();
      break;
    }
    if (!label) label = [...new Set(entries.flatMap((x) => partTickers(x.part)))].join(", ") || `Answer ${canvases.length + 1}`;
    if (label.length > 40) label = `${label.slice(0, 40)}…`;
    canvases.push({ id: m.id, label, entries });
  });

  const activeCanvas = canvases.find((c) => c.id === activeCanvasId) ?? canvases[canvases.length - 1] ?? null;
  const canvasParts = activeCanvas?.entries ?? [];
  const canvasKeys = new Set(canvases.flatMap((c) => c.entries.map((x) => refKey(x.ref))));

  const pinToCanvas = (r: ViewRef) => {
    setPinnedKeys((prev) => new Set(prev).add(refKey(r)));
    setRemovedKeys((prev) => {
      const next = new Set(prev);
      next.delete(refKey(r));
      return next;
    });
    setActiveCanvasId(r.msgId);
    setCanvasOpen(true);
  };
  const removeFromCanvas = (r: ViewRef) => setRemovedKeys((prev) => new Set(prev).add(refKey(r)));
  const showCanvasFor = (r: ViewRef) => {
    setActiveCanvasId(canvases.find((c) => c.entries.some((x) => refKey(x.ref) === refKey(r)))?.id ?? r.msgId);
    setCanvasOpen(true);
  };
  // "clear" empties only the canvas the user is looking at; its slot in the
  // history disappears and the previous canvas takes over.
  const clearActiveCanvas = () => {
    if (!activeCanvas) return;
    setRemovedKeys((prev) => {
      const next = new Set(prev);
      activeCanvas.entries.forEach((x) => next.add(refKey(x.ref)));
      return next;
    });
  };

  // Apply model-issued canvas edits (edit_canvas tool outputs), once each.
  // remove/clear act on what the user currently sees; add_new_views pins this
  // answer's views, which materializes a canvas for it and focuses it.
  const appliedEdits = useRef(new Set<string>());
  useEffect(() => {
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      m.parts.forEach((part, i) => {
        if (part.type !== "tool-edit_canvas" || !("state" in part) || part.state !== "output-available") return;
        const key = `${m.id}:${i}`;
        if (appliedEdits.current.has(key)) return;
        appliedEdits.current.add(key);
        const op = part.output as { remove?: string[]; clear?: boolean; add_new_views?: boolean };
        if (op.clear) clearActiveCanvas();
        if (op.remove?.length) setRemovedKeys((prev) => new Set([...prev, ...op.remove!]));
        if (op.add_new_views) {
          const fresh = m.parts
            .map((p, j) => ({ p, ref: { msgId: m.id, partIdx: j } }))
            .filter((x) => isViewPart(x.p))
            .map((x) => refKey(x.ref));
          setPinnedKeys((prev) => new Set([...prev, ...fresh]));
          setActiveCanvasId(m.id);
        }
        setCanvasOpen(true);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // A new dashboard answer becomes the visible canvas; older ones stay in the
  // history switcher. Fires only when the newest canvas is NEW or GAINS views
  // (streaming) — a shrink means the user removed a view, which must not
  // yank the canvas back open.
  const newestCanvas = canvases[canvases.length - 1] ?? null;
  const newestCanvasKey = newestCanvas ? `${newestCanvas.id}:${newestCanvas.entries.length}` : null;
  const seenNewest = useRef<{ id: string; count: number } | null>(null);
  useEffect(() => {
    if (!newestCanvas) return;
    const prev = seenNewest.current;
    const grew = !prev || prev.id !== newestCanvas.id || newestCanvas.entries.length > prev.count;
    seenNewest.current = { id: newestCanvas.id, count: newestCanvas.entries.length };
    if (!grew) return;
    setActiveCanvasId(newestCanvas.id);
    setCanvasOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestCanvasKey]);

  const showCanvas = canvasOpen && canvasParts.length > 0;
  const isEmpty = messages.length === 0;

  // A question sent from a chip halfway up the transcript would otherwise
  // stream its answer out of view — jump to the bottom on every new question.
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenUserMsgs = useRef(0);
  useEffect(() => {
    const userCount = messages.filter((m) => m.role === "user").length;
    if (userCount > seenUserMsgs.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    seenUserMsgs.current = userCount;
  }, [messages]);

  // Model-suggested follow-ups are "what next?" prompts: only the latest
  // answer's suggestions are current; older ones are noise.
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  // Every outgoing question — typed or clicked — carries the [canvas] block so
  // the model always knows what is pinned.
  const ask = (text: string) => {
    const canvasBlock = canvasParts.length
      ? "\n\n[canvas]\n" +
        canvasParts.map(({ ref, part }) => `${refKey(ref)} — ${describePart(part)}`).join("\n")
      : "";
    sendMessage({ text: text + canvasBlock });
  };

  const composer = (
    <form
      className={isEmpty ? "flex w-full gap-2" : "sticky bottom-4 flex gap-2"}
      onSubmit={(e) => {
        e.preventDefault();
        if (!input.trim()) return;
        ask(input);
        setInput("");
      }}
    >
      <input
        className={`flex-1 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 ${
          isEmpty ? "px-5 py-3 text-base shadow-sm" : "px-4 py-2 text-sm"
        }`}
        value={input}
        autoFocus
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask about a stock…"
      />
      {status === "streaming" ? (
        <button type="button" onClick={() => stop()} className="rounded-xl border px-4 py-2 text-sm">
          Stop
        </button>
      ) : (
        <button type="submit" className={`rounded-xl bg-blue-600 text-white ${isEmpty ? "px-5 py-3 text-base" : "px-4 py-2 text-sm"}`}>
          Ask
        </button>
      )}
    </form>
  );

  if (isEmpty) {
    return (
      <div className="flex min-h-screen flex-col px-4">
        <div className="mx-auto w-full max-w-2xl pt-4">
          <Header>
            <ChatHistory />
          </Header>
        </div>
        <HomeScreen
          home={home}
          recent={recent}
          onAsk={(text) => sendMessage({ text })}
          onTickerTile={instantOverview}
          composer={composer}
        />
      </div>
    );
  }

  return (
    <AskContext.Provider value={{ ask, busy: status === "submitted" || status === "streaming" }}>
    <div className="flex min-h-screen">
      <div className={`mx-auto p-4 flex flex-col gap-4 min-h-screen w-full ${showCanvas ? "min-w-0 flex-1 max-w-none" : "max-w-3xl"}`}>
        <Header>
          {!showCanvas && canvasParts.length > 0 && (
            <button
              type="button"
              onClick={() => setCanvasOpen(true)}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm hover:border-blue-400"
            >
              ▦ Canvas ({canvasParts.length})
            </button>
          )}
          <ChatHistory />
          <button
            type="button"
            onClick={() => window.location.assign("/")}
            title="Start a fresh conversation"
            className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm text-neutral-500 hover:border-blue-400 hover:text-blue-600"
          >
            + New chat
          </button>
        </Header>

        <div className="flex-1 space-y-4">
          {messages.map((m) => (
            <div key={m.id}>
              <div className="text-xs uppercase tracking-wide text-neutral-400 mb-1">
                {m.role === "user" ? "you" : "ticker house"}
              </div>
              {(() => {
                // Suggested follow-ups are the closing line of an answer. When
                // the model answers, suggests, then keeps talking, that tail
                // text is restating (both live tests confirmed) — drop it and
                // render the chips last. If no text preceded the suggestion,
                // keep everything: hiding a whole answer would be worse.
                const suggestIdx = m.parts.findIndex((p) => p.type === "tool-suggest_follow_ups");
                const answeredBefore =
                  suggestIdx > -1 &&
                  m.parts.some((p, j) => j < suggestIdx && p.type === "text" && p.text.trim() !== "");
                return m.parts
                  .map((part, i) => ({ part, i }))
                  .filter(({ part, i }) => !(answeredBefore && i > suggestIdx && part.type === "text"))
                  .sort(
                    (a, b) =>
                      Number(a.part.type === "tool-suggest_follow_ups") -
                      Number(b.part.type === "tool-suggest_follow_ups"),
                  );
              })().map(({ part, i }) => {
                if (part.type === "text") {
                  const text = m.role === "user" ? part.text.replace(CANVAS_BLOCK_RE, "") : part.text;
                  return (
                    <div key={i} className="prose-chat text-sm leading-relaxed space-y-2">
                      <ReactMarkdown>{text}</ReactMarkdown>
                    </div>
                  );
                }
                if (part.type === "tool-suggest_follow_ups" && m.id !== lastAssistantId) return null;
                const ref = { msgId: m.id, partIdx: i };
                const onCanvas = canvasKeys.has(refKey(ref));
                // A view lives in exactly one place: on the canvas it is
                // represented in chat only by a chip; inline otherwise.
                if (onCanvas && isViewToolPart(part) && !isErrorPart(part)) {
                  const pending = !("state" in part) || part.state !== "output-available";
                  return (
                    <div key={i} className={`chip-in my-2 inline-flex items-center gap-2 rounded-xl border border-blue-500 bg-blue-50 dark:bg-blue-950 px-3 py-2 text-sm ${pending ? "animate-pulse" : ""}`}>
                      <button type="button" onClick={() => showCanvasFor(ref)} className="flex items-center gap-2">
                        <span>▦</span>
                        <span className="font-medium">{describePart(part)}</span>
                        <span className="text-neutral-500">{pending ? "loading…" : "on canvas"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromCanvas(ref)}
                        className="text-neutral-400 hover:text-red-500"
                        aria-label="Return to chat"
                        title="Return to chat"
                      >
                        ✕
                      </button>
                    </div>
                  );
                }
                return (
                  <div key={i} className="relative group">
                    {isViewPart(part) && (
                      <button
                        type="button"
                        onClick={() => pinToCanvas(ref)}
                        className="absolute right-3 top-5 z-10 rounded-lg border px-2 py-1 text-xs transition-opacity border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-500 opacity-0 group-hover:opacity-100 hover:border-blue-400 hover:text-blue-600"
                      >
                        ▦ canvas
                      </button>
                    )}
                    <ToolPart part={part} />
                  </div>
                );
              })}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {composer}
      </div>

      {showCanvas && (
        <aside
          className="canvas-in relative hidden md:flex flex-col border-l border-neutral-200 dark:border-neutral-800"
          style={{ width: `${canvasPct}%`, flexShrink: 0 }}
        >
          <div
            onPointerDown={startDrag}
            className="absolute left-0 top-0 z-20 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500/60"
            title="Drag to resize"
          />
          <div className="sticky top-0 flex h-screen flex-col">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
              <div className="font-medium text-sm">
                {canvasTitle(canvasParts.map((x) => x.part))}{" "}
                <span className="text-neutral-400 font-normal">
                  {canvasParts.length} view{canvasParts.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={clearActiveCanvas}
                  className="text-neutral-400 hover:text-neutral-600 text-xs"
                >
                  clear
                </button>
                <button
                  type="button"
                  onClick={() => setCanvasOpen(false)}
                  className="text-neutral-400 hover:text-neutral-600 text-sm"
                  aria-label="Hide canvas"
                >
                  ✕
                </button>
              </div>
            </div>
            {canvases.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800 px-4 py-2">
                {canvases.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveCanvasId(c.id)}
                    title={c.label}
                    className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors ${
                      c.id === activeCanvas?.id
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        : "border-neutral-200 text-neutral-500 hover:border-blue-400 dark:border-neutral-800"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4">
              {canvasParts.map(({ ref, part }) => (
                <div key={refKey(ref)} className="chip-in relative group">
                  <button
                    type="button"
                    onClick={() => removeFromCanvas(ref)}
                    className="absolute right-3 top-5 z-10 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs text-neutral-500 opacity-0 group-hover:opacity-100 hover:border-red-400 hover:text-red-500"
                  >
                    remove
                  </button>
                  <ToolPart part={part} />
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}
    </div>
    </AskContext.Provider>
  );
}
