"use client";

import { useEffect, useState } from "react";
import { getBriefingSettingsAction, saveBriefingSettingsAction } from "@/app/actions";
import { RECIPES, recipeByKey } from "@/lib/recipes";

// Recipe picker + custom-instructions editor for the daily briefing
// (task 050). Templates are shown in full — readable prompts, not black
// boxes. Lives beside the Watching section header on home.
export function BriefingStyle() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [recipeKey, setRecipeKey] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (!open || loaded) return;
    getBriefingSettingsAction()
      .then((s) => {
        setRecipeKey(s.recipeKey);
        setInstructions(s.customInstructions);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [open, loaded]);

  const save = async () => {
    setState("saving");
    try {
      await saveBriefingSettingsAction(recipeKey, instructions);
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("error");
    }
  };

  const recipe = recipeByKey(recipeKey);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-md border border-neutral-200 px-2 py-0.5 text-xs text-neutral-500 transition-colors hover:border-blue-400 hover:text-blue-600 dark:border-neutral-800 dark:hover:text-blue-400"
      >
        briefing style
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-80 space-y-2 rounded-xl border border-neutral-200 bg-white p-3 text-left shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
          <div className="text-xs font-semibold">Daily briefing style</div>
          <select
            value={recipeKey ?? ""}
            onChange={(e) => setRecipeKey(e.target.value || null)}
            className="w-full rounded-lg border border-neutral-200 bg-transparent px-2 py-1.5 text-xs dark:border-neutral-800"
          >
            <option value="">Default (no recipe)</option>
            {RECIPES.map((r) => (
              <option key={r.key} value={r.key}>{r.name} — {r.blurb}</option>
            ))}
          </select>
          {recipe && (
            <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-lg bg-neutral-50 p-2 text-[11px] leading-snug text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
              {recipe.template}
            </pre>
          )}
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Custom instructions (optional) — extend or override the recipe. Presentation only; the facts stay the facts."
            rows={3}
            className="w-full rounded-lg border border-neutral-200 bg-transparent px-2 py-1.5 text-xs dark:border-neutral-800"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-neutral-400">
              {state === "saved" ? "Saved." : state === "error" ? "Save failed — try again." : ""}
            </span>
            <button
              type="button"
              onClick={save}
              disabled={state === "saving" || !loaded}
              className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {state === "saving" ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
