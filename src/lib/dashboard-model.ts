/** Pure dashboard computations (PRD Epic 4 reports). Donors are organizations, never individuals. */
import type { PaymentRow, PipelineCard } from "./pipeline-model";

export const GIFT_RANGES = [
  { label: "Under $1K", min: 0, max: 1_000 },
  { label: "$1K–5K", min: 1_000, max: 5_000 },
  { label: "$5K–10K", min: 5_000, max: 10_000 },
  { label: "$10K–30K", min: 10_000, max: 30_000 },
  { label: "Over $30K", min: 30_000, max: Infinity },
] as const;

export function giftRanges(payments: PaymentRow[]): { label: string; count: number }[] {
  return GIFT_RANGES.map((r) => ({
    label: r.label,
    count: payments.filter((p) => p.amount >= r.min && p.amount < r.max).length,
  }));
}

export function fundingMix(payments: PaymentRow[]): { type: string; amount: number }[] {
  const by = new Map<string, number>();
  for (const p of payments) by.set(p.funderType, (by.get(p.funderType) ?? 0) + p.amount);
  return [...by.entries()].map(([type, amount]) => ({ type, amount })).sort((a, b) => b.amount - a.amount);
}

/** Win rate = awarded / (awarded + declined), per funder type. Open applications don't count. */
export function winRateByType(cards: PipelineCard[]): { type: string; won: number; decided: number; rate: number }[] {
  const by = new Map<string, { won: number; decided: number }>();
  for (const c of cards) {
    if (c.stage !== "awarded" && c.stage !== "declined") continue;
    const v = by.get(c.funderType) ?? { won: 0, decided: 0 };
    v.decided++;
    if (c.stage === "awarded") v.won++;
    by.set(c.funderType, v);
  }
  return [...by.entries()].map(([type, v]) => ({ type, ...v, rate: v.won / v.decided }));
}

export function distinctByMonth(payments: PaymentRow[]): { month: string; gifts: number; funders: number }[] {
  const by = new Map<string, { gifts: number; funders: Set<string> }>();
  for (const p of payments) {
    const m = p.receivedOn.slice(0, 7);
    const v = by.get(m) ?? { gifts: 0, funders: new Set<string>() };
    v.gifts++;
    v.funders.add(p.funderName);
    by.set(m, v);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, gifts: v.gifts, funders: v.funders.size }));
}
