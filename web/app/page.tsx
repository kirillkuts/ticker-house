import { Chat } from "@/components/Chat";
import { homeSnapshot } from "@/lib/views";

// The home cards read live prices from ClickHouse on every request.
export const dynamic = "force-dynamic";

export default async function Home() {
  const home = await homeSnapshot().catch(() => []);
  return <Chat home={home} />;
}
