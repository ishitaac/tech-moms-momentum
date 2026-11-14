"use client";

import { useState, useTransition } from "react";
import { clearSampleData, refreshNow } from "@/app/actions";

export function RefreshButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg("Refreshing… this can take a few minutes.");
            const r = await refreshNow();
            setMsg(r.ok ? "Refresh complete." : r.error);
          })
        }
        className="rounded-full bg-teal px-4 py-2 text-sm font-semibold text-plum hover:opacity-90 disabled:opacity-60"
      >
        Refresh now
      </button>
      {msg && <span className="text-sm text-muted" role="status">{msg}</span>}
    </div>
  );
}

export function ClearSampleButton() {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <button
      disabled={pending || done}
      onClick={() => {
        if (!confirm("Remove all sample pipeline cards and payments?")) return;
        start(async () => {
          const r = await clearSampleData();
          setDone(r.ok);
        });
      }}
      className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-plum hover:bg-rose-tint disabled:opacity-60"
    >
      {done ? "Sample data cleared" : "Clear sample data"}
    </button>
  );
}
