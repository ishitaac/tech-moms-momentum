/** Pure Reporting computations (Funding Health). Funders are organizations only. */
import { committedVsReceivedByMonth, STAGE_LABELS, STAGES, stageTotal, type PaymentRow, type PipelineCard, type Stage } from "./pipeline-model";
import { PURPOSES, type Purpose, type PurposeGoals } from "./purposes";

export const REPORTING_TABS = [
  { id: "funding-health", label: "Funding Health" },
  { id: "funder-strategy", label: "Funder Strategy" },
  { id: "action-center", label: "Action Center" },
] as const;
export type ReportingTab = (typeof REPORTING_TABS)[number]["id"];

/** The selected sub-tab lives in the URL (?tab=...). Anything unknown falls back to Funding Health. */
export function parseTab(value: string | string[] | undefined): ReportingTab {
  const v = Array.isArray(value) ? value[0] : value;
  return REPORTING_TABS.find((t) => t.id === v)?.id ?? "funding-health";
}

type Card = PipelineCard & { awardedOn?: string | null };

export interface FundingKpis {
  committed: number;
  received: number;
  stillToReceive: number;
  activeRequests: number;
}

export function fundingKpis(cards: Card[]): FundingKpis {
  const awarded = cards.filter((c) => c.stage === "awarded");
  const committed = stageTotal(cards, "awarded");
  const received = awarded.reduce((s, c) => s + c.received, 0);
  const activeRequests = cards.filter((c) => c.stage === "loi" || c.stage === "submitted").reduce((s, c) => s + (c.amountAsked ?? 0), 0);
  return { committed, received, stillToReceive: Math.max(0, committed - received), activeRequests };
}

/** Awarded vs cash received by month. Received counts only payments on awarded items. */
export function awardedVsReceivedByMonth(cards: Card[], payments: PaymentRow[]): { month: string; awarded: number; received: number }[] {
  const awardedIds = new Set(cards.filter((c) => c.stage === "awarded").map((c) => c.id));
  return committedVsReceivedByMonth(
    cards,
    payments.filter((p) => awardedIds.has(p.pipelineItemId)),
  ).map(({ month, committed, received }) => ({ month, awarded: committed, received }));
}

/** Dollars per stage: asked for open and declined stages, awarded for Awarded. */
export function dollarsByStage(cards: Card[]): { stage: Stage; label: string; count: number; value: number }[] {
  return STAGES.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    count: cards.filter((c) => c.stage === stage).length,
    value: stageTotal(cards, stage),
  }));
}

export interface PurposeRow {
  purpose: Purpose;
  goal: number;
  awarded: number;
  received: number;
  /** Goal minus awarded, never below zero. */
  stillNeeded: number;
}

export function fundingByPurpose(cards: Card[], goals: PurposeGoals): { rows: PurposeRow[]; unassignedAwarded: number } {
  const awarded = cards.filter((c) => c.stage === "awarded");
  const rows = PURPOSES.map((purpose) => {
    const mine = awarded.filter((c) => c.purpose === purpose);
    const sumAwarded = mine.reduce((s, c) => s + (c.amountAwarded ?? 0), 0);
    const goal = goals[purpose] ?? 0;
    return { purpose, goal, awarded: sumAwarded, received: mine.reduce((s, c) => s + c.received, 0), stillNeeded: Math.max(0, goal - sumAwarded) };
  });
  return { rows, unassignedAwarded: awarded.filter((c) => !c.purpose).length };
}

/* ---------- Dates and deadlines ---------- */

export const DUE_SOON_DAYS = 30;

/** Adds whole days to a YYYY-MM-DD date (UTC math, so DST never shifts the result). */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const isDueWithin = (due: string | null | undefined, today: string, days = DUE_SOON_DAYS): boolean =>
  !!due && due >= today && due <= addDaysIso(today, days);

export interface OpenCall {
  id: number;
  funderName: string;
  title: string;
  deadline: string | null;
}

export interface DeadlineItem {
  key: string;
  funderName: string;
  title: string;
  due: string;
}

/**
 * Application deadlines due within the window, one row per real deadline.
 * Pipeline items still in play use their own (or their call's) deadline; an open call that a
 * pipeline item already points at is not listed again.
 */
export function applicationDeadlines(
  cards: (PipelineCard & { opportunityId?: number | null })[],
  openCalls: OpenCall[],
  today: string,
  days = DUE_SOON_DAYS,
): DeadlineItem[] {
  const live = cards.filter((c) => c.stage !== "awarded" && c.stage !== "declined");
  const linked = new Set(live.map((c) => c.opportunityId).filter((id): id is number => typeof id === "number"));
  const fromPipeline = live
    .filter((c) => isDueWithin(c.deadline, today, days))
    .map((c) => ({ key: `p${c.id}`, funderName: c.funderName, title: c.opportunityTitle ?? "Application", due: c.deadline! }));
  const fromCalls = openCalls
    .filter((o) => !linked.has(o.id) && isDueWithin(o.deadline, today, days))
    .map((o) => ({ key: `o${o.id}`, funderName: o.funderName, title: o.title, due: o.deadline! }));
  return [...fromPipeline, ...fromCalls].sort((a, b) => a.due.localeCompare(b.due));
}
