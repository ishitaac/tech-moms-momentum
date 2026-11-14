"use client";

import { useState, useTransition } from "react";
import { savePurposeGoals } from "@/app/actions";
import { PURPOSES, PURPOSE_LABELS, type Purpose, type PurposeGoals } from "@/lib/purposes";

/** Annual funding goal per purpose. Blank means no goal. Saving replaces any SAMPLE placeholder goals. */
export function GoalsForm({ initial, isSample }: { initial: PurposeGoals; isSample: boolean }) {
  const [values, setValues] = useState<Record<Purpose, string>>(() => Object.fromEntries(PURPOSES.map((p) => [p, initial[p] !== undefined ? String(initial[p]) : ""])) as Record<Purpose, string>);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const goals: PurposeGoals = {};
    for (const p of PURPOSES) {
      const raw = values[p].replace(/[$,\s]/g, "");
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) return setStatus({ ok: false, text: `${PURPOSE_LABELS[p]}: enter a whole dollar amount.` });
      goals[p] = n;
    }
    start(async () => {
      const r = await savePurposeGoals(goals);
      setStatus(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      {isSample && <p className="text-xs text-muted">These goals are SAMPLE placeholders. Edit and save to replace them with your own.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PURPOSES.map((p) => (
          <label key={p} className="block font-medium text-plum">
            {PURPOSE_LABELS[p]}
            <input
              inputMode="numeric"
              value={values[p]}
              onChange={(e) => setValues({ ...values, [p]: e.target.value })}
              placeholder="No goal"
              className="mt-1 w-full rounded-full border border-line bg-card px-4 py-2 text-sm text-plum"
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-full bg-plum px-4 py-2 font-semibold text-white hover:bg-plum/90 disabled:opacity-60">Save goals</button>
        {status && <span role="status" className="text-plum">{status.text}</span>}
      </div>
      <p className="text-xs text-muted">Still needed on Reporting = goal minus awarded, never below zero.</p>
    </form>
  );
}
