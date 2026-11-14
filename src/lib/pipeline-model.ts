/** Pure pipeline types and helpers — safe to import from client components. */
import type { Purpose } from "./purposes";

export const STAGES = ["prospect", "loi", "submitted", "awarded", "declined"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = {
  prospect: "Prospect",
  loi: "LOI",
  submitted: "Submitted",
  awarded: "Awarded",
  declined: "Declined",
};

export interface PipelineCard {
  id: number;
  funderId: number;
  funderName: string;
  funderType: string;
  opportunityTitle: string | null;
  stage: Stage;
  amountAsked: number | null;
  amountAwarded: number | null;
  received: number;
  deadline: string | null;
  isSample: boolean;
  /** What the money is for. Optional so older callers and tests keep working. */
  purpose?: Purpose | null;
  opportunityId?: number | null;
}

export interface PaymentRow {
  pipelineItemId: number;
  funderName: string;
  funderType: string;
  amount: number;
  receivedOn: string;
  isSample: boolean;
}

/** Dollar total shown on each column: asked for open stages, awarded (committed) for Awarded. */
export function stageTotal(cards: PipelineCard[], stage: Stage): number {
  return cards
    .filter((c) => c.stage === stage)
    .reduce((sum, c) => sum + ((stage === "awarded" ? c.amountAwarded : c.amountAsked) ?? 0), 0);
}

/** Committed vs received by month (YYYY-MM), for the dashboard's must-have chart. */
export function committedVsReceivedByMonth(
  cards: (PipelineCard & { awardedOn?: string | null })[],
  payments: PaymentRow[],
): { month: string; committed: number; received: number }[] {
  const months = new Map<string, { committed: number; received: number }>();
  const bump = (month: string, key: "committed" | "received", amount: number) => {
    const m = months.get(month) ?? { committed: 0, received: 0 };
    m[key] += amount;
    months.set(month, m);
  };
  for (const c of cards) {
    if (c.stage === "awarded" && c.amountAwarded && c.awardedOn) bump(c.awardedOn.slice(0, 7), "committed", c.amountAwarded);
  }
  for (const p of payments) bump(p.receivedOn.slice(0, 7), "received", p.amount);
  return [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));
}
