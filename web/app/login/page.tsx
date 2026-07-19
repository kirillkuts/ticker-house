import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { signInAction } from "@/app/actions";

export const dynamic = "force-dynamic";

// Sign in / create account. One form; the hidden "mode" field comes from
// whichever link brought the user here (?mode=signup flips the copy).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  const [user, { error, mode }] = await Promise.all([currentUser(), searchParams]);
  if (user) redirect("/");
  const signup = mode === "signup";

  const field =
    "w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-400";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4">
      <div className="flex items-center gap-2.5">
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
          <rect x="1" y="1" width="26" height="26" rx="7" fill="var(--viz-1)" opacity="0.12" />
          <rect x="6" y="14" width="3.5" height="8" rx="1.5" fill="var(--viz-1)" />
          <rect x="12.25" y="9" width="3.5" height="13" rx="1.5" fill="var(--viz-1)" />
          <rect x="18.5" y="5" width="3.5" height="17" rx="1.5" fill="var(--viz-1)" />
        </svg>
        <span className="text-lg font-semibold tracking-tight">TickerHouse</span>
      </div>

      <div>
        <h1 className="text-lg font-semibold">{signup ? "Create your account" : "Sign in"}</h1>
        <p className="text-sm text-neutral-500">
          {signup ? "Your chats and dashboard will be saved to this account." : "Welcome back."}
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <form action={signInAction} className="flex flex-col gap-3">
        <input type="hidden" name="mode" value={signup ? "signup" : "login"} />
        <input name="email" type="email" required placeholder="Email" autoComplete="email" className={field} />
        <input
          name="password"
          type="password"
          required
          minLength={signup ? 8 : undefined}
          placeholder={signup ? "Password (8+ characters)" : "Password"}
          autoComplete={signup ? "new-password" : "current-password"}
          className={field}
        />
        <button
          type="submit"
          className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {signup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="text-sm text-neutral-500">
        {signup ? (
          <>
            Already have an account?{" "}
            <a href="/login" className="text-blue-600 hover:underline dark:text-blue-400">Sign in</a>
          </>
        ) : (
          <>
            New here?{" "}
            <a href="/login?mode=signup" className="text-blue-600 hover:underline dark:text-blue-400">Create an account</a>
          </>
        )}
      </p>
    </div>
  );
}
