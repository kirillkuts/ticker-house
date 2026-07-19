import { Chat } from "@/components/Chat";
import { homeSnapshot } from "@/lib/views";
import { recentChats } from "@/lib/chats";

// The home cards read live prices from ClickHouse on every request.
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ ask?: string }>;
}) {
  const [home, recent, { ask }] = await Promise.all([
    homeSnapshot().catch(() => []),
    recentChats().catch(() => []),
    searchParams,
  ]);
  return <Chat home={home} recent={recent} initialAsk={ask} />;
}
