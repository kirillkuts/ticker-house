// Briefing recipes (task 050): plain-text prompt templates the user can read
// and copy. Applied ONLY in layer 2 — they shape presentation and emphasis of
// the per-user briefing, never the shared per-stock analysis or its facts.

export interface Recipe {
  key: string;
  name: string;
  blurb: string;
  template: string;
}

export const RECIPES: Recipe[] = [
  {
    key: "long-term-fundamentals",
    name: "Long-term fundamentals",
    blurb: "Business quality over price noise",
    template: `Write for a long-term fundamentals investor.
Lead with what each event means for the BUSINESS over the next several years:
revenue trajectory, margins, competitive position, capital allocation.
Treat one-day price moves as noise unless the underlying news changes the thesis;
say explicitly when a drop looks like sentiment rather than fundamentals.
Close each active stock's section with one line: what would actually change the long-term thesis.`,
  },
  {
    key: "dividend-income",
    name: "Dividend income",
    blurb: "Cash flow and payout safety first",
    template: `Write for an income investor who owns these stocks for their dividends.
For every event, lead with what it means for dividend safety: cash generation,
payout pressure, balance-sheet strain, anything hinting at a cut or a raise.
Price moves matter mainly as yield changes — a big drop is also a higher entry yield; say so.
Flag clearly when an event has no bearing on the income story.`,
  },
  {
    key: "swing-trader",
    name: "Swing trader",
    blurb: "Catalysts, momentum, levels",
    template: `Write for a swing trader with a days-to-weeks horizon.
Be terse: short bullets, not prose. Lead every section with the actionable read:
catalyst, direction, momentum. Name the concrete price levels from the briefs
(previous close, latest close) as reference points. Flag upcoming known catalysts
(a filed 8-K usually precedes the detailed 10-Q). Skip long-term business commentary entirely.`,
  },
];

export const recipeByKey = (key: string | null | undefined): Recipe | null =>
  RECIPES.find((r) => r.key === key) ?? null;
