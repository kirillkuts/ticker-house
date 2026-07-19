"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import ReactMarkdown from "react-markdown";
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react";
import type { tickerChat, ChatUIMessage } from "@/trigger/chat";
import type { HomeTicker } from "@/lib/views";
import type { RecentChat } from "@/lib/chats";
import { mintChatAccessToken, startChatSession, saveChatAction, fetchCompanyOverview, saveDashboardWidgetAction, explainElementAction, summarizeInterestAction } from "@/app/actions";
import { ViewBody } from "./ViewBody";
import { AskContext, FollowUps } from "./widgets/FollowUps";
import { FactMarkersContext, type FactMarker } from "./widgets/FactMarkers";
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

const VIEW_TOOL_TYPES = new Set([
  "tool-show_company_overview",
  "tool-show_price_chart",
  "tool-show_fundamentals",
  "tool-show_expense_breakdown",
  "tool-show_segments",
  "tool-show_category",
  "tool-query_metrics",
]);

function ToolPart({ part }: { part: Part }) {
  if (VIEW_TOOL_TYPES.has(part.type) && "state" in part && part.state === "output-available") {
    const out = part.output as { error?: string } | undefined;
    if (out && typeof out === "object" && "error" in out)
      return <ToolError error={String(out.error)} ticker={(part.input as { ticker?: string } | undefined)?.ticker} />;
    return <ViewBody tool={part.type.slice("tool-".length)} output={part.output} />;
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
  // Applied client-side (dots on the referenced view); nothing to render inline.
  if (part.type === "tool-highlight_facts") return null;
  if (part.type.startsWith("tool-")) {
    return <div className="text-xs text-neutral-400 animate-pulse">loading view…</div>;
  }
  return null;
}

const TOOL_LABELS: Record<string, string> = {
  "tool-show_company_overview": "Company overview",
  "tool-show_price_chart": "Price chart",
  "tool-show_fundamentals": "Fundamentals",
  "tool-show_expense_breakdown": "Expense breakdown",
  "tool-show_segments": "Segments",
  "tool-show_category": "Category",
  "tool-query_metrics": "Metrics",
};

// Human/model-readable one-liner for a view, used in chips and the [canvas] block.
function describePart(part: Part): string {
  const tool = TOOL_LABELS[part.type] ?? part.type.replace("tool-", "");
  const t = partTickers(part);
  const tickers = t.length <= 3 ? t.join(", ") : `${t.slice(0, 3).join(", ")} +${t.length - 3}`;
  let qualifier = "";
  if ("output" in part && part.output && typeof part.output === "object") {
    const out = part.output as { range?: string; periodType?: string; name?: string; slug?: string; spec?: { period?: string; metrics?: string[] } };
    if (out.slug && out.name) qualifier = out.name;
    else if (out.range) qualifier = out.range;
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
    part.type !== "tool-suggest_follow_ups" &&
    part.type !== "tool-highlight_facts"
  );
}

// Fact anchors a message's highlight_facts calls declared for its views.
function factMarkersOf(m: { parts: Part[] }): FactMarker[] {
  return m.parts.flatMap((p) => {
    if (p.type !== "tool-highlight_facts" || !("input" in p) || !p.input) return [];
    const input = p.input as { ticker?: string; facts?: { period: string; column: string; snippet: string }[] };
    return (input.facts ?? []).map((f) => ({ ...f, ticker: input.ticker }));
  });
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
  "tool-show_expense_breakdown",
  "tool-show_segments",
  "tool-show_category",
]);

// A view on the canvas, identified by its position in the message list so we
// always render from the live message parts.
interface ViewRef {
  msgId: string;
  partIdx: number;
}
const refKey = (r: ViewRef) => `${r.msgId}:${r.partIdx}`;

// Explain mode (Cmd held) can scope a question to a piece of a widget, not
// just the whole view. These are the pieces worth asking about: anything a
// widget explicitly labels via data-explain, plus structural kinds we can
// recognize without annotations (charts, tables, headings, prose).
const EXPLAIN_SELECTOR = "[data-explain], .recharts-responsive-container, table, h3, p";

function explainTarget(from: HTMLElement, within: HTMLElement): HTMLElement | null {
  const el = from.closest(EXPLAIN_SELECTOR) as HTMLElement | null;
  return el && el !== within && within.contains(el) ? el : null;
}

function explainKind(el: HTMLElement): string {
  if (el.dataset.explain) return el.dataset.explain;
  if (el.classList.contains("recharts-responsive-container")) return "chart";
  if (el.tagName === "TABLE") return "table";
  if (el.tagName === "H3") return "section heading";
  return "text block";
}

// Highlight box for the sub-element under the cursor, positioned relative to
// its widget wrapper (keyed by the wrapper's view ref).
interface SubTarget {
  key: string;
  top: number;
  left: number;
  width: number;
  height: number;
  kind: string;
}

// Cmd+click explanation popover (task 032): one at a time, anchored to the
// clicked element's viewport position (fixed), so it survives canvas
// switches and re-renders while an answer is still streaming. The answer
// never enters the chat thread.
interface ExplainPop {
  token: number;
  top: number;
  left: number;
  kind: string;
  status: "loading" | "done" | "error";
  answer: string;
  suggestions: { label: string; prompt: string }[];
}

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
  initialAsk,
}: {
  home?: HomeTicker[];
  recent?: RecentChat[];
  chatId?: string;
  initialMessages?: ChatUIMessage[];
  // Question to send on mount (e.g. a dashboard chip seeding a new chat).
  initialAsk?: string;
}) {
  const transport = useTriggerChatTransport<typeof tickerChat>({
    task: "ticker-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) => startChatSession({ chatId, clientData }),
  });

  // A chat is addressable from birth: the id comes from the /chat/[id] route
  // when revisiting, or is minted here for a fresh conversation.
  const [chatId] = useState(() => routeChatId ?? crypto.randomUUID());
  const { messages: rawMessages, sendMessage, setMessages, stop, status } = useChat<ChatUIMessage>({
    id: chatId,
    messages: initialMessages,
    transport,
  });
  // A resumed session can re-deliver a message whose id initialMessages
  // already holds, and React then sees two children with one key (task 042).
  // Dedupe by id, keeping the LAST occurrence (freshest state) at the first
  // occurrence's position; every consumer below reads the deduped list.
  const messages = useMemo(() => {
    const byId = new Map<string, ChatUIMessage>();
    for (const m of rawMessages) byId.set(m.id, m);
    return rawMessages.length === byId.size ? rawMessages : [...byId.values()];
  }, [rawMessages]);

  // A covered-company tile is a known question with a known answer: fetch the
  // overview directly and inject the exchange as messages, skipping the agent
  // roundtrip. The agent's server-side history won't contain this exchange —
  // the [canvas] block on the next question tells it what's on screen.
  const instantOverview = async (ticker: string) => {
    const text = `Give me the full overview of ${ticker}`;
    try {
      const out = await fetchCompanyOverview(ticker);
      if (out && typeof out === "object" && "error" in out) throw new Error(out.error);
      const stamp = crypto.randomUUID();
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
      sendMessage({ text }, { metadata: { speed: "fast" } }); // no direct data — a pre-prompted ask, so the fast model handles it
    }
  };

  // A seeded question (dashboard chip → new chat) fires once on mount.
  const askedInitial = useRef(false);
  useEffect(() => {
    if (!initialAsk || askedInitial.current || messages.length > 0) return;
    askedInitial.current = true;
    sendMessage({ text: initialAsk }, { metadata: { speed: "fast" } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAsk]);

  // Cmd held = explain mode: canvas widgets highlight, and a click asks the
  // fast model what the view shows instead of interacting with it. Hovering
  // narrows the target to the chart / table / title / text under the cursor.
  const [metaHeld, setMetaHeld] = useState(false);
  const [subTarget, setSubTarget] = useState<SubTarget | null>(null);
  const [explainPop, setExplainPop] = useState<ExplainPop | null>(null);
  const explainSeq = useRef(0);
  // Interest signals for the session digest (task 039). In-memory per
  // session: typed questions and chip clicks also live in messages, but
  // explain-clicks, saves and removals exist only here.
  const signals = useRef<{ kind: string; text: string }[]>([]);
  const [summarizing, setSummarizing] = useState(false);
  // Escape or a click outside dismiss the popover. pointerdown (not click)
  // so a cmd+click on another explain target closes the old one first and
  // its own click-capture handler then opens the new one; clicks inside the
  // popover (text selection, the X) are left alone.
  const popOpen = explainPop !== null;
  useEffect(() => {
    if (!popOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExplainPop(null);
    };
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-explain-popover]")) setExplainPop(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [popOpen]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.metaKey) setMetaHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Meta") {
        setMetaHeld(false);
        setSubTarget(null);
      }
    };
    const clear = () => {
      setMetaHeld(false);
      setSubTarget(null);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  // Widgets saved to the live dashboard this session, keyed by view ref.
  const [savedWidgets, setSavedWidgets] = useState<Set<string>>(new Set());
  const saveWidget = (r: ViewRef, part: Part) => {
    const key = refKey(r);
    if (savedWidgets.has(key)) return;
    signals.current.push({ kind: "save", text: describePart(part).slice(0, 160) });
    setSavedWidgets((prev) => new Set(prev).add(key));
    saveDashboardWidgetAction(
      crypto.randomUUID(),
      part.type.slice("tool-".length),
      JSON.stringify(("input" in part ? part.input : undefined) ?? {}),
    ).catch(() => {});
  };

  // As soon as the conversation exists, move the URL to its permanent home
  // without a navigation (a router push would remount and drop the stream).
  // Category chats keep their own canonical URL (/category/tech IS the chat).
  const hasMessages = messages.length > 0;
  useEffect(() => {
    const path = window.location.pathname;
    if (hasMessages && !path.startsWith("/chat/") && !path.startsWith("/category/")) {
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
  // Re-asking the same question must not yield two identically-named tabs.
  const labelCounts = new Map<string, number>();
  messages.forEach((m, mi) => {
    if (m.role !== "assistant") return;
    const views = m.parts
      .map((p, i) => ({ part: p, ref: { msgId: m.id, partIdx: i } }))
      .filter((x) => isViewToolPart(x.part));
    if (views.length === 0) return;
    // "The model edited the canvas itself, so its edit wins" only applies to
    // COMPLETED edits that don't add this answer's views. A still-streaming
    // edit_canvas call must not disqualify: it would momentarily empty this
    // canvas and flash the previous one back (task 028). And a completed
    // add_new_views edit wants these views on canvas anyway — qualifying keeps
    // them visible during the render before the pinning effect runs.
    const edits = m.parts.filter((p) => p.type === "tool-edit_canvas");
    const editsDone = edits.every((p) => "state" in p && p.state === "output-available");
    const editAdds = edits.some(
      (p) =>
        "state" in p && p.state === "output-available" &&
        Boolean((p.output as { add_new_views?: boolean } | undefined)?.add_new_views),
    );
    const modelEdited = edits.length > 0 && editsDone && !editAdds;
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
    const nth = (labelCounts.get(label) ?? 0) + 1;
    labelCounts.set(label, nth);
    if (nth > 1) label = `${label} · ${nth}`;
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
  const removeFromCanvas = (r: ViewRef) => {
    const part = messages.find((m) => m.id === r.msgId)?.parts[r.partIdx];
    signals.current.push({ kind: "remove", text: part ? describePart(part).slice(0, 160) : refKey(r) });
    setRemovedKeys((prev) => new Set(prev).add(refKey(r)));
  };
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
  // the model always knows what is pinned. Pre-prompted questions (fast: true)
  // ride with speed metadata so the agent picks a smaller model for them.
  const ask = (text: string, opts?: { fast?: boolean }) => {
    signals.current.push({ kind: opts?.fast ? "chip" : "typed", text: text.slice(0, 160) });
    const canvasBlock = canvasParts.length
      ? "\n\n[canvas]\n" +
        canvasParts.map(({ ref, part }) => `${refKey(ref)} — ${describePart(part)}`).join("\n")
      : "";
    sendMessage({ text: text + canvasBlock }, opts?.fast ? { metadata: { speed: "fast" } } : undefined);
  };

  // Session digest (task 039): the model ranks the produced views against the
  // interest signals; the picked views are COPIED into a new local message —
  // so the digest is itself a canvas, saveable to the dashboard per widget
  // and persisted with the chat like any other exchange.
  const summarizeSession = async () => {
    if (summarizing) return;
    const views = messages.flatMap((m) =>
      m.role !== "assistant"
        ? []
        : m.parts
            .map((part, i) => ({ part, ref: { msgId: m.id, partIdx: i } }))
            .filter((x) => isViewPart(x.part))
            .map((x) => ({ id: refKey(x.ref), desc: describePart(x.part), part: x.part })),
    );
    if (views.length === 0) return;
    setSummarizing(true);
    try {
      const res = await summarizeInterestAction(
        JSON.stringify(
          signals.current.length
            ? signals.current
            : [{ kind: "typed", text: "(no explicit signals recorded — pick the most informative views)" }],
        ),
        JSON.stringify(views.map(({ id, desc }) => ({ id, desc }))),
      );
      if ("error" in res) throw new Error(res.error);
      const byId = new Map(views.map((v) => [v.id, v.part]));
      const picked = res.picks.map((p) => byId.get(p.id)).filter((p): p is Part => Boolean(p));
      if (picked.length === 0) throw new Error("no views picked");
      const stamp = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: `local-su-${stamp}`,
          role: "user" as const,
          parts: [{ type: "text" as const, text: "Summarize this session for me" }],
        },
        {
          id: `local-sa-${stamp}`,
          role: "assistant" as const,
          parts: [
            { type: "text" as const, text: `**${res.title}**\n\n${res.note}` },
            ...picked.map((part, i) => ({ ...(part as object), toolCallId: `summary-${stamp}-${i}` })),
          ],
        } as ChatUIMessage,
      ]);
    } catch {
      // Silent failure keeps the session intact; the button re-enables.
    }
    setSummarizing(false);
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
          onAsk={(text) => sendMessage({ text }, { metadata: { speed: "fast" } })}
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
              ▦<span className="hidden @lg:inline"> Canvas</span> ({canvasParts.length})
            </button>
          )}
          <ChatHistory />
          <button
            type="button"
            onClick={() => window.location.assign("/")}
            title="Start a fresh conversation"
            className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm text-neutral-500 hover:border-blue-400 hover:text-blue-600 whitespace-nowrap"
          >
            +<span className="hidden @lg:inline"> New chat</span>
          </button>
        </Header>

        <div className="flex-1 space-y-4">
          {messages.map((m) => (
            <div key={m.id}>
              <div className="text-xs uppercase tracking-wide text-neutral-400 mb-1">
                {m.role === "user" ? "you" : "tickerhouse"}
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
                      <div className="absolute right-3 top-5 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => saveWidget(ref, part)}
                          title="Save to the live dashboard"
                          className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs text-neutral-500 hover:border-blue-400 hover:text-blue-600"
                        >
                          {savedWidgets.has(refKey(ref)) ? "✓ saved" : "☆ save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => pinToCanvas(ref)}
                          className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs text-neutral-500 hover:border-blue-400 hover:text-blue-600"
                        >
                          ▦ canvas
                        </button>
                      </div>
                    )}
                    <FactMarkersContext.Provider value={factMarkersOf(m)}>
                      <ToolPart part={part} />
                    </FactMarkersContext.Provider>
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
                  onClick={summarizeSession}
                  disabled={summarizing}
                  title="Build a digest canvas of what you focused on this session"
                  className="text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 text-xs disabled:animate-pulse"
                >
                  {summarizing ? "summarizing…" : "✦ summarize"}
                </button>
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
                        : "border-neutral-200 text-neutral-500 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4">
              {canvasParts.map(({ ref, part }) => (
                <div
                  key={refKey(ref)}
                  className={`chip-in relative group ${metaHeld ? "cursor-help rounded-xl ring-2 ring-blue-300 dark:ring-blue-700" : ""}`}
                  title={metaHeld ? "Cmd+click: explain this" : undefined}
                  onMouseOverCapture={(e) => {
                    if (!metaHeld) return;
                    const wrap = e.currentTarget as HTMLElement;
                    const el = explainTarget(e.target as HTMLElement, wrap);
                    const key = refKey(ref);
                    if (!el) {
                      setSubTarget((h) => (h && h.key === key ? null : h));
                      return;
                    }
                    const wr = wrap.getBoundingClientRect();
                    const r = el.getBoundingClientRect();
                    setSubTarget({
                      key,
                      top: r.top - wr.top,
                      left: r.left - wr.left,
                      width: r.width,
                      height: r.height,
                      kind: explainKind(el),
                    });
                  }}
                  onMouseLeave={() => setSubTarget((h) => (h && h.key === refKey(ref) ? null : h))}
                  onClickCapture={(e) => {
                    if (!e.metaKey) return;
                    const target = e.target as HTMLElement;
                    if (target.closest("button, a, input, select, textarea")) return;
                    if (target.closest("[data-explain-popover]")) return;
                    e.preventDefault();
                    e.stopPropagation();
                    // Anchor a popover to the clicked piece (or the whole
                    // view) and fetch a one-off explanation — the answer
                    // stays out of the chat thread (task 032).
                    const wrap = e.currentTarget as HTMLElement;
                    const el = explainTarget(target, wrap);
                    const ar = (el ?? wrap).getBoundingClientRect();
                    const kind = el ? explainKind(el) : "view";
                    const section = el?.closest("section")?.querySelector("h3")?.textContent?.trim();
                    // innerText skips SVG <text>, so charts fall back to
                    // textContent to still quote their axis/legend labels.
                    const snippet = el
                      ? (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240)
                      : "";
                    const widgetText = (wrap.innerText || "").replace(/\s+/g, " ").trim().slice(0, 1600);
                    const question = el
                      ? `The user cmd+clicked a ${kind}${section ? ` in the "${section}" section` : ""} of the view "${describePart(part)}". Its visible content: "${snippet}". Surrounding view text: "${widgetText}". What is this ${kind} showing and how should a non-expert read it?`
                      : `The user cmd+clicked the view "${describePart(part)}". Its visible text: "${widgetText}". What is this view showing and how should a non-expert read it?`;
                    signals.current.push({ kind: "explain", text: `${kind}: ${snippet.slice(0, 120)}` });
                    const token = ++explainSeq.current;
                    setExplainPop({
                      token,
                      top: Math.min(ar.bottom + 6, window.innerHeight - 160),
                      left: Math.min(Math.max(ar.left, 8), window.innerWidth - 336),
                      kind,
                      status: "loading",
                      answer: "",
                      suggestions: [],
                    });
                    explainElementAction(question).then((res) => {
                      setExplainPop((p) =>
                        p && p.token === token
                          ? "error" in res
                            ? { ...p, status: "error", answer: res.error }
                            : { ...p, status: "done", answer: res.text, suggestions: res.suggestions }
                          : p,
                      );
                    });
                  }}
                >
                  {metaHeld && subTarget?.key === refKey(ref) && (
                    <div
                      className="pointer-events-none absolute z-20 rounded-md ring-2 ring-blue-500"
                      style={{ top: subTarget.top, left: subTarget.left, width: subTarget.width, height: subTarget.height }}
                    >
                      <span className="absolute left-0 -top-4 rounded bg-blue-600 px-1 py-px text-[10px] font-medium text-white">
                        {subTarget.kind}
                      </span>
                    </div>
                  )}
                  <div className="absolute right-3 top-5 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => saveWidget(ref, part)}
                      title="Save to the live dashboard"
                      className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs text-neutral-500 hover:border-blue-400 hover:text-blue-600"
                    >
                      {savedWidgets.has(refKey(ref)) ? "✓ saved" : "☆ save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromCanvas(ref)}
                      className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs text-neutral-500 hover:border-red-400 hover:text-red-500"
                    >
                      remove
                    </button>
                  </div>
                  <FactMarkersContext.Provider
                    value={factMarkersOf(messages.find((m) => m.id === ref.msgId) ?? { parts: [] })}
                  >
                    <ToolPart part={part} />
                  </FactMarkersContext.Provider>
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}
    </div>
    {explainPop && (
      <div
        data-explain-popover
        className="fixed z-50 w-80 rounded-xl border p-3 shadow-lg"
        style={{
          top: explainPop.top, left: explainPop.left,
          background: "var(--tooltip-bg)", borderColor: "var(--tooltip-border)",
        }}
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide text-neutral-400">
            what is this {explainPop.kind}?
          </span>
          <button
            type="button"
            onClick={() => setExplainPop(null)}
            aria-label="Dismiss explanation"
            className="-mr-1 -mt-1 rounded px-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            ✕
          </button>
        </div>
        {explainPop.status === "loading" ? (
          <div className="animate-pulse text-sm text-neutral-500">Thinking…</div>
        ) : explainPop.status === "error" ? (
          <div className="text-sm text-red-500">{explainPop.answer}</div>
        ) : (
          <>
            <div className="prose-chat max-h-72 space-y-2 overflow-y-auto text-[13px] leading-relaxed">
              <ReactMarkdown>{explainPop.answer}</ReactMarkdown>
            </div>
            {explainPop.suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 border-t border-neutral-100 dark:border-neutral-800 pt-2">
                {explainPop.suggestions.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    title={s.prompt}
                    onClick={() => {
                      setExplainPop(null);
                      ask(s.prompt, { fast: true });
                    }}
                    className="rounded-full border border-neutral-200 dark:border-neutral-800 px-2.5 py-1 text-[11px] text-neutral-500 dark:text-neutral-400 transition-colors hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {s.label} →
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    )}
    </AskContext.Provider>
  );
}
