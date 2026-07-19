import { redirect } from "next/navigation";
import { Chat } from "@/components/Chat";
import { homeSnapshot } from "@/lib/views";
import { loadChat, recentChats } from "@/lib/chats";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  // Scoped by owner: someone else's chat id behaves like an unknown id.
  const stored = await loadChat(user.id, id).catch(() => null);
  // An unknown id behaves like a fresh chat at this URL: show the home screen;
  // the first message will be stored under this id.
  const [home, recent] = stored
    ? [[], []]
    : await Promise.all([homeSnapshot().catch(() => []), recentChats(user.id).catch(() => [])]);
  return <Chat home={home} recent={recent} chatId={id} initialMessages={stored?.messages ?? []} />;
}
