import nodemailer from "nodemailer";
import type { BriefingView, BriefingStockSection } from "./briefing";
import { LOGO_PNG_BASE64 } from "./logo-data";
import { sparklinePng } from "./sparkline";

// Emails the daily briefing via Gmail SMTP (app password). Off unless both
// GMAIL_USER and GMAIL_APP_PASSWORD are set, so the feature stays dormant
// until credentials exist. HTML uses inline styles + tables: mail clients
// (Gmail especially) strip <style> and don't do fl[ex]/grid reliably.

const UP = "#006300";
const DOWN = "#d03b3b";
const MUTED = "#9ca3af";
const LINK = "#2563eb";

// Where the "ask" links point. The app auto-submits ?ask=… on landing
// (app/page.tsx -> Chat initialAsk). Absolute URL required in email.
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export function emailEnabled(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s: string): string {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

// Any leftover URLs the model slipped in — links are dropped everywhere.
function stripUrls(s: string): string {
  return s
    .replace(/\s*https?:\/\/[^\s)]+/g, "")
    .replace(/,\s*\)/g, ")")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function questionsFor(symbol: string): string[] {
  return [
    `Give me the full overview of ${symbol}`,
    `Show the ${symbol} price chart for the last 3 months`,
    `How have ${symbol}'s revenue and margins trended?`,
  ];
}

const moveColor = (pct: number) => (pct >= 0 ? UP : DOWN);
const dirColor = (d: string) => (d === "up" ? UP : d === "down" ? DOWN : MUTED);
const arrow = (d: string) => (d === "up" ? "▲ " : d === "down" ? "▼ " : "");
const cidFor = (symbol: string) => `spark-${symbol.replace(/[^A-Za-z0-9]/g, "")}`;

function sparkBuffers(view: BriefingView): Map<string, Buffer> {
  const m = new Map<string, Buffer>();
  for (const s of view.sections) {
    if (s.spark && s.spark.length >= 2) {
      m.set(s.symbol, sparklinePng(s.spark, s.spark[s.spark.length - 1] >= s.spark[0]));
    }
  }
  return m;
}

// Body is markdown bullets ("- …") now; render a tight list. Anything else
// (the quiet one-liner) stays a plain line.
function bodyHtml(body: string): string {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^[-*]\s+/.test(l)).map((l) => l.replace(/^[-*]\s+/, ""));
  if (bullets.length) {
    const items = bullets.map((b) => `<li style="margin:0 0 5px;">${inline(stripUrls(b))}</li>`).join("");
    return `<ul style="font-size:13px;line-height:1.5;color:#333;margin:10px 0 0;padding-left:20px;">${items}</ul>`;
  }
  return lines
    .map((l) => `<div style="font-size:13px;line-height:1.55;color:#666;margin-top:6px;">${inline(stripUrls(l))}</div>`)
    .join("");
}

function tiles(section: BriefingStockSection): string {
  if (section.metrics.length === 0) return "";
  const cells = section.metrics
    .map(
      (m) => `
      <td style="border:1px solid #ececec;border-radius:10px;padding:8px 10px;background:#fafafa;vertical-align:top;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:${MUTED};">${esc(m.label)}</div>
        <div style="font-size:16px;font-weight:700;color:#111;">${esc(m.value)}</div>
        ${m.delta ? `<div style="font-size:12px;font-weight:600;color:${dirColor(m.direction)};">${arrow(m.direction)}${esc(m.delta)}</div>` : ""}
      </td>`,
    )
    .join('<td style="width:8px;"></td>');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:10px 0 2px;"><tr>${cells}</tr></table>`;
}

function askChips(symbol: string): string {
  const chips = questionsFor(symbol)
    .map(
      (q) =>
        `<a href="${APP_URL}/?ask=${encodeURIComponent(q)}" style="display:inline-block;border:1px solid #dbe4f0;border-radius:9999px;padding:6px 12px;margin:8px 6px 0 0;font-size:12px;color:${LINK};text-decoration:none;background:#f6f9fd;">${esc(q)}</a>`,
    )
    .join("");
  return `<div>${chips}</div>`;
}

function sectionHtml(s: BriefingStockSection, sparkSrc: string | null): string {
  const badge = s.priceMove
    ? ` <span style="font-size:13px;font-weight:700;color:${moveColor(s.priceMove.movePct)};">${s.priceMove.movePct >= 0 ? "▲ +" : "▼ "}${s.priceMove.movePct.toFixed(1)}%</span>`
    : "";
  const spark = sparkSrc
    ? `<td align="right" style="vertical-align:middle;width:132px;"><img src="${sparkSrc}" width="130" height="26" alt="" style="display:block;border:0;"></td>`
    : "";
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #ececec;border-radius:16px;margin:0 0 14px;">
    <tr><td style="padding:16px 18px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
        <tr>
          <td style="vertical-align:middle;font-size:16px;font-weight:700;color:#111;">${esc(s.symbol)}${badge}</td>
          ${spark}
        </tr>
      </table>
      ${s.takeaway ? `<div style="font-size:14px;font-weight:500;color:#1a1a1a;margin-top:8px;">${inline(s.takeaway)}</div>` : ""}
      ${tiles(s)}
      ${bodyHtml(s.body)}
      ${s.status === "events" ? askChips(s.symbol) : ""}
    </td></tr>
  </table>`;
}

// Overview is markdown bullets (layer 2). Render "- " lines as a list.
function overviewHtml(body: string): string {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^[-*]\s+/.test(l)).map((l) => l.replace(/^[-*]\s+/, ""));
  if (bullets.length) {
    const items = bullets.map((b) => `<li style="margin:0 0 7px;">${inline(stripUrls(b))}</li>`).join("");
    return `<ul style="font-size:14px;line-height:1.5;color:#333;margin:0 0 4px;padding-left:20px;">${items}</ul>`;
  }
  return lines
    .map((p) => `<p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 10px;">${inline(stripUrls(p))}</p>`)
    .join("");
}

function buildHtml(view: BriefingView, logoSrc: string, sparkSrc: (symbol: string) => string | null): string {
  const sections = view.sections.map((s) => sectionHtml(s, sparkSrc(s.symbol))).join("");
  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#fff;border-radius:18px;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;padding-right:10px;"><img src="${logoSrc}" width="28" height="28" alt="TickerHouse" style="display:block;border:0;"></td>
            <td style="vertical-align:middle;font-size:18px;font-weight:700;color:#111;">TickerHouse</td>
          </tr></table>
          <div style="font-size:14px;color:${MUTED};margin:8px 0 16px;">Daily briefing — ${esc(view.date)}</div>
          ${overviewHtml(view.body)}
          <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:${MUTED};margin:18px 0 10px;">Per stock</div>
          ${sections}
        </td></tr>
      </table>
    </td></tr>
  </table>
  </body></html>`;
}

// Preview HTML with everything inlined as data URIs (no attachments) — for the
// --html dump and screenshots.
export function briefingHtml(view: BriefingView): string {
  const sparks = sparkBuffers(view);
  return buildHtml(
    view,
    `data:image/png;base64,${LOGO_PNG_BASE64}`,
    (sym) => {
      const b = sparks.get(sym);
      return b ? `data:image/png;base64,${b.toString("base64")}` : null;
    },
  );
}

// Send-ready HTML plus the CID attachments it references (logo + sparklines).
function renderEmail(view: BriefingView): { html: string; attachments: { filename: string; content: Buffer; cid: string }[] } {
  const sparks = sparkBuffers(view);
  const attachments: { filename: string; content: Buffer; cid: string }[] = [
    { filename: "logo.png", content: Buffer.from(LOGO_PNG_BASE64, "base64"), cid: "logo" },
  ];
  for (const [sym, b] of sparks) attachments.push({ filename: `${cidFor(sym)}.png`, content: b, cid: cidFor(sym) });
  const html = buildHtml(view, "cid:logo", (sym) => (sparks.has(sym) ? `cid:${cidFor(sym)}` : null));
  return { html, attachments };
}

export async function sendBriefingEmail(to: string, view: BriefingView): Promise<void> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD not set");
  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  const { html, attachments } = renderEmail(view);
  await transporter.sendMail({ from: `TickerHouse <${user}>`, to, subject: `Daily briefing — ${view.date}`, html, attachments });
}
