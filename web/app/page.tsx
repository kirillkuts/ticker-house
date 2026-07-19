import { redirect } from "next/navigation";
import { Chat } from "@/components/Chat";
import { homeSnapshot } from "@/lib/views";
import { recentChats } from "@/lib/chats";
import { currentUser } from "@/lib/auth";

// The home cards read live prices from ClickHouse on every request.
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ ask?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const [home, recent, { ask }] = await Promise.all([
    homeSnapshot().catch(() => []),
    recentChats(user.id).catch(() => []),
    searchParams,
  ]);
  return <Chat home={home} recent={recent} initialAsk={ask} />;
}
