import Link from "next/link";
import { redirect } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { Header } from "@/components/Header";
import { RunBriefingButton } from "@/components/RunBriefingButton";
import { BriefingStyle } from "@/components/BriefingStyle";
import { currentUser } from "@/lib/auth";
import { briefingDates, briefingForDate } from "@/lib/briefing";

export const dynamic = "force-dynamic";

// Inline SVG sparkline of recent closes, coloured by net direction.
function Spark({ values }: { values: number[] }) {
  if (!values || values.length < 2) return null;
  const w = 116, h = 26, pad = 3;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = pad + (i * (w - 2 * pad)) / (values.length - 1);
      const y = h - pad - ((v - min) / span) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const color = values[values.length - 1] >= values[0] ? "var(--viz-up-text)" : "var(--viz-down-text)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Task 051: the daily briefing, per-stock sections with filing links and
// jumps into the existing widgets, and a date switcher for history (same
// pattern as the dashboard's ?d= param: a link per date).
export default async function BriefingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const [{ date }, dates] = await Promise.all([searchParams, briefingDates(user.id)]);
  const selected = date && dates.includes(date) ? date : dates[0];
  const view = selected ? await briefingForDate(user.id, selected) : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-4">
      <Header>
        <Link
          href="/"
          className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm text-neutral-500 hover:border-blue-400 hover:text-blue-600 whitespace-nowrap"
        >
          ← Chat
        </Link>
      </Header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Daily briefing</h1>
          <RunBriefingButton />
          <BriefingStyle />
        </div>
        {dates.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {dates.map((d) => (
              <Link
                key={d}
                href={`/briefing?date=${d}`}
                aria-current={d === selected ? "date" : undefined}
                className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                  d === selected
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-neutral-200 text-neutral-500 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
                }`}
              >
                {d}
              </Link>
            ))}
          </div>
        )}
      </div>

      {!view ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-sm text-neutral-500">
          No briefings yet. Star a company on the{" "}
          <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">home screen</Link>{" "}
          (the ☆ on any tile) and the morning agent will start writing one for you each weekday.
        </div>
      ) : (
        <>
          <article className="prose-chat space-y-2 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 text-sm leading-relaxed">
            <ReactMarkdown>{view.body}</ReactMarkdown>
          </article>

          {view.sections.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Per stock</h2>
              {view.sections.map((s) => (
                <section
                  key={s.symbol}
                  className="space-y-2 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-3">
                      <span className="font-semibold">
                        {s.symbol}
                        {s.priceMove && (
                          <span
                            className="ml-2 text-xs font-medium"
                            style={{ color: s.priceMove.movePct >= 0 ? "var(--viz-up-text)" : "var(--viz-down-text)" }}
                          >
                            {s.priceMove.movePct >= 0 ? "▲ +" : "▼ "}{s.priceMove.movePct.toFixed(1)}% on {s.priceMove.date}
                          </span>
                        )}
                      </span>
                      <Spark values={s.spark} />
                    </span>
                    <span className="flex gap-1.5 text-xs">
                      <a
                        href={`/?ask=${encodeURIComponent(`Give me the full overview of ${s.symbol}`)}`}
                        className="rounded-md border border-neutral-200 px-2 py-0.5 text-neutral-500 hover:border-blue-400 hover:text-blue-600 dark:border-neutral-800"
                      >
                        Overview →
                      </a>
                      <a
                        href={`/?ask=${encodeURIComponent(`Show the ${s.symbol} price chart for the last month`)}`}
                        className="rounded-md border border-neutral-200 px-2 py-0.5 text-neutral-500 hover:border-blue-400 hover:text-blue-600 dark:border-neutral-800"
                      >
                        Price chart →
                      </a>
                    </span>
                  </div>
                  {s.takeaway && (
                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{s.takeaway}</p>
                  )}
                  {s.metrics.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {s.metrics.map((m, i) => {
                        const color =
                          m.direction === "up" ? "var(--viz-up-text)"
                          : m.direction === "down" ? "var(--viz-down-text)"
                          : undefined;
                        return (
                          <div
                            key={`${m.label}-${i}`}
                            className="min-w-[7rem] flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900"
                          >
                            <div className="text-[11px] uppercase tracking-wide text-neutral-400">{m.label}</div>
                            <div className="text-base font-semibold tabular-nums">{m.value}</div>
                            {m.delta && (
                              <div className="text-xs font-medium tabular-nums" style={{ color }}>
                                {m.direction === "up" ? "▲ " : m.direction === "down" ? "▼ " : ""}{m.delta}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="prose-chat space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
                    <ReactMarkdown>{s.body}</ReactMarkdown>
                  </div>
                  {s.filings.length > 0 && (
                    <ul className="space-y-0.5 text-xs">
                      {s.filings.map((f) => (
                        <li key={f.url}>
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {f.form} filed {f.filedDate}
                            {f.items ? ` · items ${f.items}` : ""} · EDGAR ↗
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
