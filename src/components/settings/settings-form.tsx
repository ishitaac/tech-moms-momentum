"use client";

import { useState, useTransition } from "react";
import { saveSettings } from "@/app/actions";

const KINDS = [
  { id: "new_match", label: "New matches" },
  { id: "open_call", label: "New open calls" },
  { id: "deadline", label: "Deadline reminders" },
] as const;

interface Initial {
  notifyEmail: string;
  alertKinds: string[];
  reminderDays: number[];
  snoozeDays: number;
}

export function SettingsForm({ initial }: { initial: Initial }) {
  const [email, setEmail] = useState(initial.notifyEmail);
  const [kinds, setKinds] = useState(new Set(initial.alertKinds));
  const [days, setDays] = useState(initial.reminderDays.join(", "));
  const [snooze, setSnooze] = useState(String(initial.snoozeDays));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const reminderDays = days.split(",").map((d) => Number(d.trim())).filter((d) => Number.isInteger(d) && d >= 0);
    start(async () => {
      const r = await saveSettings({
        notifyEmail: email.trim(),
        alertKinds: [...kinds] as ("new_match" | "open_call" | "deadline")[],
        reminderDays,
        snoozeDays: Number(snooze),
      });
      setStatus(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
    });
  };

  const field = "mt-1 w-full rounded-full border border-control bg-card px-4 py-2 text-sm text-plum";
  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <label className="block font-medium text-plum">
        Email for updates
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="grants@example.org" className={field} />
      </label>
      <fieldset>
        <legend className="font-medium text-plum">Send me</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {KINDS.map((k) => (
            <label key={k.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="accent-plum"
                checked={kinds.has(k.id)}
                onChange={(e) => {
                  const next = new Set(kinds);
                  if (e.target.checked) next.add(k.id);
                  else next.delete(k.id);
                  setKinds(next);
                }}
              />
              {k.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <label className="block font-medium text-plum">
          Remind me (days before)
          <input value={days} onChange={(e) => setDays(e.target.value)} className={field} />
        </label>
        <label className="block font-medium text-plum">
          Snooze for (days)
          <input type="number" min={1} max={365} value={snooze} onChange={(e) => setSnooze(e.target.value)} className={field} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-full bg-plum px-4 py-2 font-semibold text-white hover:bg-plum/90 disabled:opacity-60">Save</button>
        {status && <span role="status" className={status.ok ? "text-plum" : "text-plum"}>{status.text}</span>}
      </div>
      <p className="text-xs text-muted">Without a verified sending domain, emails reach only the email account that owns the Resend key.</p>
    </form>
  );
}
