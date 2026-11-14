"use client";

import { useTransition } from "react";
import { markNotificationsRead } from "@/app/actions";

export function MarkAllRead() {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => void (await markNotificationsRead()))}
      className="rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-plum hover:bg-plum-tint disabled:opacity-60"
    >
      Mark all as read
    </button>
  );
}
