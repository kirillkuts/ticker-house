import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { DashboardGrid } from "@/components/DashboardGrid";
import { DashboardSwitcher } from "@/components/DashboardSwitcher";
import { listDashboards, listDashboardWidgets, runDashboardRecipe } from "@/lib/dashboard";
import { currentUser } from "@/lib/auth";

// Recipes re-run against ClickHouse on every request — the data is live.
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const [{ d }, dashboards] = await Promise.all([searchParams, listDashboards(user.id).catch(() => [])]);
  const active = dashboards.find((x) => x.id === d) ?? dashboards[0] ?? null;
  const recipes = active ? await listDashboardWidgets(user.id, active.id).catch(() => []) : [];
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
        <Link
          href="/"
          className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm text-neutral-500 hover:border-blue-400 hover:text-blue-600 whitespace-nowrap"
        >
          +<span className="hidden @lg:inline"> New chat</span>
        </Link>
      </Header>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">{active ? active.name : "Dashboard"}</h1>
        <span className="text-xs text-neutral-500">live data · refreshes on every load</span>
      </div>
      {dashboards.length > 0 && <DashboardSwitcher dashboards={dashboards} activeId={active!.id} />}
      <DashboardGrid widgets={widgets} />
    </div>
  );
}
