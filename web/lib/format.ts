// "2026-07-18 09:15:00.000" (UTC from ClickHouse) → "2h ago" / "Jul 12".
export function relativeTime(updatedAt: string): string {
  const then = new Date(updatedAt.replace(" ", "T") + "Z");
  if (isNaN(then.getTime())) return "";
  const mins = Math.max(0, Math.round((Date.now() - then.getTime()) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  if (mins < 60 * 24 * 7) return `${Math.round(mins / (60 * 24))}d ago`;
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
