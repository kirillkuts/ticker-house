import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { DashboardGrid } from "@/components/DashboardGrid";
import { listDashboardWidgets, runDashboardRecipe } from "@/lib/dashboard";
import { currentUser } from "@/lib/auth";

// Recipes re-run against ClickHouse on every request — the data is live.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const recipes = await listDashboardWidgets(user.id).catch(() => []);
  const widgets = await Promise.all(
    recipes.map(async (r) => ({
      widgetId: r.widgetId,
      tool: r.tool,
      output: await runDashboardRecipe(r),
    })),
  );
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-4">
      <Header>
        <a
          href="/"
          className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm text-neutral-500 hover:border-blue-400 hover:text-blue-600 whitespace-nowrap"
        >
          +<span className="hidden @lg:inline"> New chat</span>
        </a>
      </Header>
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <span className="text-xs text-neutral-500">live data · refreshes on every load</span>
      </div>
      <DashboardGrid widgets={widgets} />
    </div>
  );
}
