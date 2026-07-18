"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import ReactMarkdown from "react-markdown";
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react";
import type { tickerChat, ChatUIMessage } from "@/trigger/chat";
import type { SingleStockPriceData, FundamentalsData, CompanyOverviewData, HomeTicker } from "@/lib/views";
import { mintChatAccessToken, startChatSession } from "@/app/actions";
import type { MetricQueryResult } from "@/lib/metric-query";
import { SingleStockPrice } from "./widgets/SingleStockPrice";
import { Fundamentals } from "./widgets/Fundamentals";
import { MetricResult } from "./widgets/MetricResult";
import { CompanyOverview } from "./widgets/CompanyOverview";
import { HomeScreen } from "./HomeScreen";

type Part = ChatUIMessage["parts"][number];

function ToolPart({ part }: { part: Part }) {
  if (part.type === "tool-show_company_overview" && part.state === "output-available") {
    const out = part.output as CompanyOverviewData | { error: string };
    if ("error" in out) return <div className="text-sm text-red-500">{out.error}</div>;
    return <CompanyOverview data={out} />;
  }
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
  return part.type.startsWith("tool-") && part.type !== "tool-edit_canvas";
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

// A view on the canvas, identified by its position in the message list so we
// always render from the live message parts.
interface ViewRef {
  msgId: string;
  partIdx: number;
}
const refKey = (r: ViewRef) => `${r.msgId}:${r.partIdx}`;

export function Chat({ home = [] }: { home?: HomeTicker[] }) {
  const transport = useTriggerChatTransport<typeof tickerChat>({
    task: "ticker-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) => startChatSession({ chatId, clientData }),
  });

  const { messages, sendMessage, stop, status } = useChat<ChatUIMessage>({ transport });
  const [input, setInput] = useState("");
  const [canvas, setCanvas] = useState<ViewRef[]>([]);
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

  const resolvePart = (r: ViewRef): Part | null =>
    messages.find((m) => m.id === r.msgId)?.parts[r.partIdx] ?? null;

  const canvasKeys = new Set(canvas.map(refKey));
  const addToCanvas = (r: ViewRef) => {
    setCanvas((prev) => (prev.some((x) => refKey(x) === refKey(r)) ? prev : [...prev, r]));
    setCanvasOpen(true);
  };
  const removeFromCanvas = (r: ViewRef) =>
    setCanvas((prev) => prev.filter((x) => refKey(x) !== refKey(r)));

  // Apply model-issued canvas edits (edit_canvas tool outputs), once each.
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
        setCanvas((prev) => {
          let next = op.clear ? [] : prev;
          if (op.remove?.length) {
            const drop = new Set(op.remove);
            next = next.filter((r) => !drop.has(refKey(r)));
          }
          if (op.add_new_views) {
            const fresh = m.parts
              .map((p, j) => ({ p, ref: { msgId: m.id, partIdx: j } }))
              .filter((x) => isViewPart(x.p) && !next.some((r) => refKey(r) === refKey(x.ref)))
              .map((x) => x.ref);
            next = [...next, ...fresh];
          }
          return next;
        });
        setCanvasOpen(true);
      });
    }
  }, [messages]);

  // Multi-view answers (2+ view tool calls in one message) auto-open on the
  // canvas: replace its content, like opening a fresh dashboard. Counting
  // CALLS (not finished outputs) moves views over as soon as the second call
  // starts, before the widgets settle inline. Messages where the model edited
  // the canvas itself are exempt — its edit wins.
  const artifactRefs = messages
    .filter((m) => m.role === "assistant" && !m.parts.some((p) => p.type === "tool-edit_canvas"))
    .map((m) => ({
      id: m.id,
      refs: m.parts.map((p, i) => ({ part: p, ref: { msgId: m.id, partIdx: i } })).filter((x) => isViewToolPart(x.part)),
    }))
    .filter((a) => a.refs.length >= 2);
  const latestArtifact = artifactRefs[artifactRefs.length - 1] ?? null;
  const latestArtifactKey = latestArtifact
    ? `${latestArtifact.id}:${latestArtifact.refs.length}`
    : null;
  useEffect(() => {
    if (latestArtifact) {
      setCanvas(latestArtifact.refs.map((x) => x.ref));
      setCanvasOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestArtifactKey]);

  // Keep pending views (query still running) on the canvas as placeholders;
  // drop only errors and vanished parts.
  const canvasParts = canvas
    .map((r) => ({ ref: r, part: resolvePart(r) }))
    .filter((x): x is { ref: ViewRef; part: Part } => x.part !== null && isViewToolPart(x.part) && !isErrorPart(x.part));
  const showCanvas = canvasOpen && canvasParts.length > 0;
  const isEmpty = messages.length === 0;

  const composer = (
    <form
      className={isEmpty ? "flex w-full gap-2" : "sticky bottom-4 flex gap-2"}
      onSubmit={(e) => {
        e.preventDefault();
        if (!input.trim()) return;
        const canvasBlock = canvasParts.length
          ? "\n\n[canvas]\n" +
            canvasParts.map(({ ref, part }) => `${refKey(ref)} — ${describePart(part)}`).join("\n")
          : "";
        sendMessage({ text: input + canvasBlock });
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
      <div className="flex min-h-screen px-4">
        <HomeScreen home={home} onAsk={(text) => sendMessage({ text })} composer={composer} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <div className={`mx-auto p-4 flex flex-col gap-4 min-h-screen w-full ${showCanvas ? "min-w-0 flex-1 max-w-none" : "max-w-3xl"}`}>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Ticker House</h1>
          {!showCanvas && canvasParts.length > 0 && (
            <button
              type="button"
              onClick={() => setCanvasOpen(true)}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm hover:border-blue-400"
            >
              ▦ Canvas ({canvasParts.length})
            </button>
          )}
        </div>

        <div className="flex-1 space-y-4">
          {messages.map((m) => (
            <div key={m.id}>
              <div className="text-xs uppercase tracking-wide text-neutral-400 mb-1">
                {m.role === "user" ? "you" : "ticker house"}
              </div>
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  const text = m.role === "user" ? part.text.replace(CANVAS_BLOCK_RE, "") : part.text;
                  return (
                    <div key={i} className="prose-chat text-sm leading-relaxed space-y-2">
                      <ReactMarkdown>{text}</ReactMarkdown>
                    </div>
                  );
                }
                const ref = { msgId: m.id, partIdx: i };
                const onCanvas = canvasKeys.has(refKey(ref));
                // A view lives in exactly one place: on the canvas it is
                // represented in chat only by a chip; inline otherwise.
                if (onCanvas && isViewToolPart(part) && !isErrorPart(part)) {
                  const pending = !("state" in part) || part.state !== "output-available";
                  return (
                    <div key={i} className={`chip-in my-2 inline-flex items-center gap-2 rounded-xl border border-blue-500 bg-blue-50 dark:bg-blue-950 px-3 py-2 text-sm ${pending ? "animate-pulse" : ""}`}>
                      <button type="button" onClick={() => setCanvasOpen(true)} className="flex items-center gap-2">
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
                        onClick={() => addToCanvas(ref)}
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
                  onClick={() => setCanvas([])}
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
  );
}
