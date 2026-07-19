import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { CategoryView } from "@/components/CategoryView";
import { categorySnapshot } from "@/lib/views";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { slug } = await params;
  const data = await categorySnapshot(slug).catch(() => null);
  if (!data) notFound();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-4">
      <Header>
        <Link
          href="/"
          className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm text-neutral-500 hover:border-blue-400 hover:text-blue-600 whitespace-nowrap"
        >
          +<span className="hidden @lg:inline"> New chat</span>
        </Link>
      </Header>
      <CategoryView data={data} />
    </div>
  );
}
