import { redirect } from "next/navigation";
import { Chat } from "@/components/Chat";
import { homeSnapshot, watchlistQuotes, type WatchlistQuote } from "@/lib/views";
import { currentUser } from "@/lib/auth";
import { getWatchlist } from "@/lib/watchlist";

// The home cards read live prices from ClickHouse on every request.
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ ask?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const [home, watch, { ask }] = await Promise.all([
    homeSnapshot().catch(() => []),
    getWatchlist(user.id).catch(() => []),
    searchParams,
  ]);
  // Watched tickers outside the fundamentals universe still get a tile:
  // symbol + last close from the price data (task 045).
  const watchlist = watch.map((w) => w.symbol);
  const uncovered = watchlist.filter((s) => !home.some((h) => h.ticker.toUpperCase() === s));
  const watchlistExtra: WatchlistQuote[] = uncovered.length
    ? await watchlistQuotes(uncovered).catch(() => [])
    : [];
  return <Chat home={home} initialAsk={ask} watchlist={watchlist} watchlistExtra={watchlistExtra} />;
}
