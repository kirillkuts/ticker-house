import { Chat } from "@/components/Chat";
import { homeSnapshot } from "@/lib/views";
import { loadChat, recentChats } from "@/lib/chats";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stored = await loadChat(id).catch(() => null);
  // An unknown id behaves like a fresh chat at this URL: show the home screen;
  // the first message will be stored under this id.
  const [home, recent] = stored
    ? [[], []]
    : await Promise.all([homeSnapshot().catch(() => []), recentChats().catch(() => [])]);
  return <Chat home={home} recent={recent} chatId={id} initialMessages={stored?.messages ?? []} />;
}
