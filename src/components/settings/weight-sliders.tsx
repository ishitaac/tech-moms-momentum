"use client";

import { useState, useTransition } from "react";
import { saveWeights } from "@/app/actions";
import { COMPONENT_KEYS, COMPONENT_LABELS, type Weights } from "@/config/scoring";

/** Flagged (weightTuning): Robbyn adjusts what matters; the list re-ranks without any AI calls. */
export function WeightSliders({ initial, defaults }: { initial: Weights; defaults: Weights }) {
  const [w, setW] = useState<Weights>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const total = COMPONENT_KEYS.reduce((s, k) => s + w[k], 0);

  const apply = (weights: Weights | null) =>
    start(async () => {
      setMsg("Re-ranking…");
      const r = await saveWeights(weights);
      setMsg(r.ok ? "List re-ranked with your weights." : r.error);
      if (r.ok && weights === null) setW(defaults);
    });

  return (
    <div className="space-y-3 text-sm">
      {COMPONENT_KEYS.map((k) => (
        <label key={k} className="block">
          <span className="flex justify-between">
            <span className="font-medium text-plum">{COMPONENT_LABELS[k]}</span>
            <span className="tabular-nums text-muted">{total ? Math.round((w[k] / total) * 100) : 0}%</span>
          </span>
          <input type="range" min={0} max={1} step={0.05} value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} className="w-full accent-plum" />
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending} onClick={() => apply(w)} className="rounded-full bg-plum px-4 py-2 font-semibold text-white disabled:opacity-60">Apply & re-rank</button>
        <button disabled={pending} onClick={() => apply(null)} className="rounded-full border border-line px-3 py-2 font-semibold text-plum disabled:opacity-60">Reset to defaults</button>
        {msg && <span className="text-muted" role="status">{msg}</span>}
      </div>
      <p className="text-xs text-muted">Percentages are each weight&apos;s share of the total. Re-ranking uses saved evidence — no AI calls.</p>
    </div>
  );
}
