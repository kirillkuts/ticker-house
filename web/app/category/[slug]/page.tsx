import { notFound, redirect } from "next/navigation";
import { Chat } from "@/components/Chat";
import { categorySnapshot } from "@/lib/views";
import { loadChat } from "@/lib/chats";
import { currentUser } from "@/lib/auth";
import { categoryBySlug } from "@/lib/categories";
import type { ChatUIMessage } from "@/trigger/chat";

export const dynamic = "force-dynamic";

// A category is a chat entry point (task 036): /category/tech resumes the
// user's chat for that category, or seeds a fresh one with the category
// dashboard pre-rendered — the same trick as the instant company-tile path.
// One chat per (user, category); follow-up questions continue it, and the
// URL stays linkable.
export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { slug } = await params;
  const cat = categoryBySlug.get(slug);
  if (!cat) notFound();

  const chatId = `category-${slug}-${user.id}`;
  const stored = await loadChat(user.id, chatId).catch(() => null);
  if (stored) {
    return <Chat chatId={chatId} initialMessages={stored.messages} />;
  }

  const data = await categorySnapshot(slug).catch(() => null);
  if (!data) notFound();

  // Fabricated exchange: the known question with its known answer. The agent
  // doesn't have this turn server-side; the [canvas] block on the next
  // question tells it what's on screen.
  const seed = [
    {
      id: `seed-u-${slug}`,
      role: "user" as const,
      parts: [{ type: "text" as const, text: `Show me the ${cat.name} category` }],
    },
    {
      id: `seed-a-${slug}`,
      role: "assistant" as const,
      parts: [
        {
          type: "tool-show_category" as const,
          toolCallId: `seed-call-${slug}`,
          state: "output-available" as const,
          input: { category: slug },
          output: data,
        },
      ],
    },
  ] as ChatUIMessage[];

  return <Chat chatId={chatId} initialMessages={seed} />;
}
