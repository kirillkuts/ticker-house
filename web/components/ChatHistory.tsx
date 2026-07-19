"use client";

import { useEffect, useRef, useState } from "react";
import { listRecentChats } from "@/app/actions";
import type { RecentChat } from "@/lib/chats";
import { relativeTime } from "@/lib/format";

// Header dropdown listing past chats. Fetches on every open so a chat saved
// seconds ago already shows up.
export function ChatHistory() {
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<RecentChat[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    listRecentChats().then(setChats).catch(() => setChats([]));
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Your past chats"
        className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm text-neutral-500 hover:border-blue-400 hover:text-blue-600"
      >
        Chats
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 py-1 shadow-lg">
          {chats === null ? (
            <div className="px-3 py-2 text-sm text-neutral-400">loading…</div>
          ) : chats.length === 0 ? (
            <div className="px-3 py-2 text-sm text-neutral-400">No chats yet</div>
          ) : (
            chats.map((c) => (
              <a
                key={c.chatId}
                href={`/chat/${c.chatId}`}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <span className="truncate">{c.title || "Untitled chat"}</span>
                <span className="shrink-0 text-xs text-neutral-400">{relativeTime(c.updatedAt)}</span>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  );
}
