/**
 * Pure report calculations (Reports: Funding Health, Funder Strategy, Action Center).
 * Built only from existing tables: pipeline_items, payments, opportunities, funders.
 * Funders are organizations only. Where data is not recorded, values are null ("Not recorded"), never 0.
 */
import { STAGE_LABELS, STAGES, type Stage } from "./pipeline-model";

/* ---------- Tabs (kept in the URL as ?tab=) ---------- */

export const REPORT_TABS = [
  { id: "funding-health", label: "Funding Health" },
  { id: "funder-strategy", label: "Funder Strategy" },
  { id: "action-center", label: "Action Center" },
] as const;
export type ReportTab = (typeof REPORT_TABS)[number]["id"];

/** Anything unknown falls back to Funding Health. */
export function parseTab(value: string | string[] | undefined): ReportTab {
  const v = Array.isArray(value) ? value[0] : value;
  return REPORT_TABS.find((t) => t.id === v)?.id ?? "funding-health";
}

/* ---------- Inputs (read from the existing schema by reports-queries.ts) ---------- */

export interface ReportItem {
  id: number;
  funderId: number;
  funderName: string;
  funderType: string;
  stage: Stage;
  amountAsked: number | null;
  amountAwarded: number | null;
  /** pipeline_items.deadline */
  deadline: string | null;
  awardedOn: string | null;
  isSample: boolean;
  /** Linked opportunity, if any (pipeline_items.opportunity_id). */
  opportunityId: number | null;
  opportunityTitle: string | null;
  opportunityDeadline: string | null;
  route: string | null;
  /** Sum of payments.amount for this item. */
  received: number;
}

export interface ReportPayment {
  pipelineItemId: number;
  amount: number;
  receivedOn: string;
}

export interface ReportOpenCall {
  id: number;
  funderName: string;
  title: string;
  deadline: string | null;
  route: string | null;
  awardMin: number | null;
  awardMax: number | null;
}

/* ---------- Small helpers ---------- */

export const NOT_RECORDED = "Not recorded";
const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (n: number[]) => round2(n.reduce((s, x) => s + x, 0));
export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export const DUE_SOON_DAYS = 30;
export const URGENT_DAYS = 7;
/**
 * The calendar route (/api/calendar/[key]) only resolves deadlines inside this window. Keep it equal to
 * DEADLINE_WINDOW_DAYS in pipeline-queries.ts so "Add to calendar" is only offered where it works.
 */
export const CALENDAR_WINDOW_DAYS = 60;

/** Adds whole days to YYYY-MM-DD (UTC math, so DST never shifts the result). */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from today to a YYYY-MM-DD date (negative when past). */
export function daysUntil(iso: string, today: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** The pipeline item's own deadline first; the linked opportunity's deadline only when the item has none. */
export const effectiveDeadline = (i: ReportItem): string | null => i.deadline ?? i.opportunityDeadline;

export const hasSampleData = (items: ReportItem[]) => items.some((i) => i.isSample);

/* ---------- Funding Health: KPIs ---------- */

export interface DataQuality {
  /** Awarded items whose payments exceed the award. Surfaced, never hidden. */
  overpaid: { funderName: string; over: number; isSample: boolean }[];
  awardedMissingAmount: number;
  awardedMissingDate: number;
  activeMissingAsk: number;
}

export interface FundingKpis {
  awardedCount: number;
  /** null = awarded items exist but none has an amount ("Not recorded"). 0 only when there are no awarded items. */
  committed: number | null;
  cashReceived: number;
  stillToReceive: number | null;
  activeRequests: number | null;
  quality: DataQuality;
}

export function fundingKpis(items: ReportItem[]): FundingKpis {
  const awarded = items.filter((i) => i.stage === "awarded");
  const withAmount = awarded.filter((i) => i.amountAwarded !== null);
  const active = items.filter((i) => i.stage === "loi" || i.stage === "submitted");
  const activeWithAsk = active.filter((i) => i.amountAsked !== null);

  return {
    awardedCount: awarded.length,
    committed: awarded.length === 0 ? 0 : withAmount.length === 0 ? null : sum(withAmount.map((i) => i.amountAwarded!)),
    cashReceived: sum(awarded.map((i) => i.received)),
    // Per item, so one overpayment can't hide another item's balance.
    stillToReceive: awarded.length === 0 ? 0 : withAmount.length === 0 ? null : sum(withAmount.map((i) => Math.max(0, i.amountAwarded! - i.received))),
    activeRequests: active.length === 0 ? 0 : activeWithAsk.length === 0 ? null : sum(activeWithAsk.map((i) => i.amountAsked!)),
    quality: {
      overpaid: withAmount.filter((i) => i.received > i.amountAwarded!).map((i) => ({ funderName: i.funderName, over: round2(i.received - i.amountAwarded!), isSample: i.isSample })),
      awardedMissingAmount: awarded.length - withAmount.length,
      awardedMissingDate: awarded.filter((i) => !i.awardedOn).length,
      activeMissingAsk: active.length - activeWithAsk.length,
    },
  };
}

/* ---------- Funding Health: Chart A (Funding Movement) ---------- */

export function awardedVsReceivedByMonth(items: ReportItem[], payments: ReportPayment[]): { rows: { month: string; awarded: number; received: number }[]; awardedWithoutDate: number } {
  const awarded = items.filter((i) => i.stage === "awarded");
  const awardedIds = new Set(awarded.map((i) => i.id));
  const by = new Map<string, { awarded: number; received: number }>();
  const bump = (month: string, key: "awarded" | "received", amount: number) => {
    const m = by.get(month) ?? { awarded: 0, received: 0 };
    m[key] = round2(m[key] + amount);
    by.set(month, m);
  };
  // Awarded records with no award date can't be placed in a month, so they are left out and counted instead.
  for (const i of awarded) if (i.amountAwarded !== null && i.awardedOn) bump(i.awardedOn.slice(0, 7), "awarded", i.amountAwarded);
  for (const p of payments) if (awardedIds.has(p.pipelineItemId)) bump(p.receivedOn.slice(0, 7), "received", p.amount);
  return {
    rows: [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v })),
    awardedWithoutDate: awarded.filter((i) => !i.awardedOn).length,
  };
}

/* ---------- Funding Health: Chart B (Pipeline at a Glance) ---------- */

export interface StageGlance {
  stage: Stage;
  label: string;
  count: number;
  /** Awarded uses amount_awarded; every other stage uses amount_asked. null = items exist but no amount is recorded. */
  dollars: number | null;
}

export function pipelineGlance(items: ReportItem[]): StageGlance[] {
  return STAGES.map((stage) => {
    const mine = items.filter((i) => i.stage === stage);
    const amounts = mine.map((i) => (stage === "awarded" ? i.amountAwarded : i.amountAsked)).filter((n): n is number => n !== null);
    return { stage, label: STAGE_LABELS[stage], count: mine.length, dollars: mine.length === 0 ? 0 : amounts.length === 0 ? null : sum(amounts) };
  });
}

/* ---------- Funding Health: Chart C (Cash Collection Tracker) ---------- */

export interface CollectionRow {
  itemId: number;
  funderName: string;
  awarded: number | null;
  received: number;
  stillToReceive: number | null;
  /** received / awarded, as a fraction (can exceed 1 when overpaid). */
  percentReceived: number | null;
  overpaidBy: number;
  nextAction: string;
  isSample: boolean;
}

export function collectionTracker(items: ReportItem[]): CollectionRow[] {
  return items
    .filter((i) => i.stage === "awarded")
    .map((i): CollectionRow => {
      const awarded = i.amountAwarded !== null && i.amountAwarded > 0 ? i.amountAwarded : null;
      const remaining = awarded === null ? null : Math.max(0, round2(awarded - i.received));
      return {
        itemId: i.id,
        funderName: i.funderName,
        awarded,
        received: i.received,
        stillToReceive: remaining,
        percentReceived: awarded === null ? null : i.received / awarded,
        overpaidBy: awarded !== null && i.received > awarded ? round2(i.received - awarded) : 0,
        nextAction: awarded === null ? "Record the award amount" : i.received >= awarded ? "Fully received" : "Follow up on payment",
        isSample: i.isSample,
      };
    })
    .sort((a, b) => (b.stillToReceive ?? -1) - (a.stillToReceive ?? -1) || a.funderName.localeCompare(b.funderName));
}

/* ---------- Funder Strategy ---------- */

export const STRATEGY_TYPES = ["state", "federal", "corporate", "foundation", "family_foundation"] as const;
export type StrategyType = (typeof STRATEGY_TYPES)[number];
export const STRATEGY_LABELS: Record<StrategyType, string> = {
  state: "State",
  federal: "Federal",
  corporate: "Corporate",
  foundation: "Foundation",
  family_foundation: "Family Foundation",
};

/** Rule thresholds for the recommended actions. Plain constants (not editable in the app). */
export const MIN_DECIDED = 5;
export const STATE_PRIORITIZE_WIN_RATE = 0.4;
export const FEDERAL_LOW_WIN_RATE = 0.15;
export const FOUNDATION_MIN_AWARDS = 1;
export const FOUNDATION_MIN_ACTIVE = 3;
export const CORPORATE_HIGH_VALUE = 10_000;

export const ACTION_TEXT = {
  state: "Prioritize Utah and state opportunities",
  foundation: "Grow local foundation relationships",
  corporate: "Pursue strategic corporate partners",
  federal: "Apply selectively to national grants",
  collect: "Collect more outcome data before prioritizing.",
  none: "No recommendation from current rules.",
} as const;

export interface StrategyRow {
  type: StrategyType;
  label: string;
  items: number;
  /** Items currently in Submitted, Awarded or Declined. Stage history is not tracked. */
  submitted: number;
  awards: number;
  decided: number;
  /** null when fewer than MIN_DECIDED decided opportunities ("Not enough data"). */
  winRate: number | null;
  enoughData: boolean;
  amountReceived: number;
  /** Mean of recorded award amounts. null when there are no awards, or awards with no recorded amount (the UI tells them apart with `awards`). */
  averageAward: number | null;
  /** Items in LOI or Submitted. */
  activeRequests: number;
  hasSample: boolean;
  action: string;
}

export function strategyRows(items: ReportItem[]): StrategyRow[] {
  const base = STRATEGY_TYPES.map((type) => {
    const mine = items.filter((i) => i.funderType === type);
    const awardedItems = mine.filter((i) => i.stage === "awarded");
    const awardAmounts = awardedItems.map((i) => i.amountAwarded).filter((n): n is number => n !== null);
    const decided = mine.filter((i) => i.stage === "awarded" || i.stage === "declined").length;
    const enoughData = decided >= MIN_DECIDED;
    return {
      type,
      label: STRATEGY_LABELS[type],
      items: mine.length,
      submitted: mine.filter((i) => i.stage === "submitted" || i.stage === "awarded" || i.stage === "declined").length,
      awards: awardedItems.length,
      decided,
      winRate: enoughData ? awardedItems.length / decided : null,
      enoughData,
      amountReceived: sum(mine.map((i) => i.received)),
      averageAward: awardAmounts.length === 0 ? null : sum(awardAmounts) / awardAmounts.length,
      activeRequests: mine.filter((i) => i.stage === "loi" || i.stage === "submitted").length,
      hasSample: mine.some((i) => i.isSample),
      highValue: mine.some((i) => i.stage !== "declined" && Math.max(i.amountAsked ?? 0, i.amountAwarded ?? 0) >= CORPORATE_HIGH_VALUE),
    };
  });
  const maxReceived = Math.max(0, ...base.map((r) => r.amountReceived));

  return base.map(({ highValue, ...r }) => ({ ...r, action: recommend(r, highValue, maxReceived) }));
}

function recommend(r: Omit<StrategyRow, "action">, highValue: boolean, maxReceived: number): string {
  if (r.items === 0) return ACTION_TEXT.collect;
  switch (r.type) {
    case "state":
      if ((r.winRate !== null && r.winRate >= STATE_PRIORITIZE_WIN_RATE) || (r.amountReceived > 0 && r.amountReceived === maxReceived)) return ACTION_TEXT.state;
      break;
    case "foundation":
    case "family_foundation":
      if (r.awards >= FOUNDATION_MIN_AWARDS || r.activeRequests >= FOUNDATION_MIN_ACTIVE) return ACTION_TEXT.foundation;
      break;
    case "corporate":
      if (r.awards > 0 || r.amountReceived > 0 || highValue) return ACTION_TEXT.corporate;
      break;
    case "federal":
      // Limited decision history counts as a reason to be selective.
      if (r.winRate === null || r.winRate < FEDERAL_LOW_WIN_RATE) return ACTION_TEXT.federal;
      break;
  }
  return r.enoughData ? ACTION_TEXT.none : ACTION_TEXT.collect;
}

/* ---------- Action Center ---------- */

export type ActionGroup = "overdue" | "this-week" | "next-30" | "later" | "no-deadline" | "payments";
const GROUP_ORDER: ActionGroup[] = ["overdue", "this-week", "next-30", "later", "no-deadline", "payments"];

export interface ActionRow {
  /** Calendar key (p<pipeline item> / o<opportunity>) when the existing calendar route can serve it, else null. */
  calendarKey: string | null;
  kind: "pipeline" | "open-call" | "payment";
  group: ActionGroup;
  /** null = not scheduled (payment follow-ups, open calls without a deadline). Dates are never invented. */
  due: string | null;
  funderName: string;
  /** Opportunity title, when there is one. */
  detail: string | null;
  action: string;
  amountText: string;
  /** Numeric amount behind amountText (asked, or balance for payments); null for ranges and unrecorded. Used for sorting. */
  amountValue: number | null;
  route: string;
  status: "Open Call" | "Payment pending";
  nextAction: string;
  overdueTag: "Overdue" | "Deadline passed" | null;
  isSample: boolean;
}

export interface ActionKpis {
  applicationsDueSoon: number;
  paymentsPendingCount: number;
  paymentsPendingBalance: number;
  openCallsNotInPipeline: number;
  /** null = awarded items exist but none has an amount. */
  awardedOutstanding: number | null;
  awardedMissingAmount: number;
}

const ROUTE_TEXT: Record<string, string> = { loi: "LOI first", direct: "Direct application" };
const routeText = (route: string | null) => (route ? (ROUTE_TEXT[route] ?? "Not specified") : "Not specified");

const NEXT = {
  application: "Review requirements and prepare LOI/direct application.",
  openCall: "Review eligibility and add to pipeline if relevant.",
  payment: "Confirm payment timing with funder.",
} as const;

function groupFor(due: string, today: string): ActionGroup {
  const d = daysUntil(due, today);
  return d < 0 ? "overdue" : d <= URGENT_DAYS ? "this-week" : d <= DUE_SOON_DAYS ? "next-30" : "later";
}

const calendarKeyFor = (prefix: "p" | "o", id: number, due: string, today: string) => {
  const d = daysUntil(due, today);
  return d >= 0 && d <= CALENDAR_WINDOW_DAYS ? `${prefix}${id}` : null;
};

/** Open calls with no pipeline item linked through opportunity_id (any stage). */
export function unlinkedOpenCalls(items: ReportItem[], openCalls: ReportOpenCall[]): ReportOpenCall[] {
  const linked = new Set(items.map((i) => i.opportunityId).filter((id): id is number => id !== null));
  return openCalls.filter((o) => !linked.has(o.id));
}

/** Items still working toward an application. A Submitted item whose deadline has passed is not overdue. */
function pipelineDeadlineItems(items: ReportItem[], today: string): { item: ReportItem; due: string }[] {
  return items.flatMap((item) => {
    if (item.stage !== "prospect" && item.stage !== "loi" && item.stage !== "submitted") return [];
    const due = effectiveDeadline(item);
    if (!due) return [];
    if (due < today && item.stage === "submitted") return [];
    return [{ item, due }];
  });
}

/** Application deadlines in the next 30 days: pipeline items plus open calls not yet in the pipeline. Each counted once. */
export function applicationsDueSoon(items: ReportItem[], openCalls: ReportOpenCall[], today: string): number {
  const fromPipeline = pipelineDeadlineItems(items, today).filter(({ due }) => isWithin(due, today, DUE_SOON_DAYS)).length;
  const fromCalls = unlinkedOpenCalls(items, openCalls).filter((o) => o.deadline && isWithin(o.deadline, today, DUE_SOON_DAYS)).length;
  return fromPipeline + fromCalls;
}

const isWithin = (due: string, today: string, days: number) => {
  const d = daysUntil(due, today);
  return d >= 0 && d <= days;
};

function rangeText(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return min === max ? money(min) : `${money(min)}–${money(max)}`;
  if (max !== null) return `Up to ${money(max)}`;
  if (min !== null) return `From ${money(min)}`;
  return "Not stated";
}

export function actionCenter(items: ReportItem[], openCalls: ReportOpenCall[], today: string): { rows: ActionRow[]; kpis: ActionKpis } {
  const rows: ActionRow[] = [];

  for (const { item, due } of pipelineDeadlineItems(items, today)) {
    rows.push({
      calendarKey: calendarKeyFor("p", item.id, due, today),
      kind: "pipeline",
      group: groupFor(due, today),
      due,
      funderName: item.funderName,
      detail: item.opportunityTitle,
      action: "Application deadline",
      amountText: item.amountAsked === null ? NOT_RECORDED : money(item.amountAsked),
      amountValue: item.amountAsked,
      route: routeText(item.route),
      status: "Open Call",
      nextAction: NEXT.application,
      overdueTag: due < today ? "Overdue" : null,
      isSample: item.isSample,
    });
  }

  const unlinked = unlinkedOpenCalls(items, openCalls);
  for (const o of unlinked) {
    const due = o.deadline;
    rows.push({
      calendarKey: due ? calendarKeyFor("o", o.id, due, today) : null,
      kind: "open-call",
      group: due ? groupFor(due, today) : "no-deadline",
      due,
      funderName: o.funderName,
      detail: o.title,
      action: due ? "Application deadline" : "Review open opportunity",
      amountText: rangeText(o.awardMin, o.awardMax),
      amountValue: null,
      route: routeText(o.route),
      status: "Open Call",
      nextAction: NEXT.openCall,
      overdueTag: due && due < today ? "Deadline passed" : null,
      isSample: false,
    });
  }

  const tracker = collectionTracker(items).filter((c) => c.stillToReceive !== null && c.stillToReceive > 0);
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const c of tracker) {
    rows.push({
      calendarKey: null,
      kind: "payment",
      group: "payments",
      due: null,
      funderName: c.funderName,
      detail: byId.get(c.itemId)?.opportunityTitle ?? null,
      action: "Payment follow-up",
      amountText: money(c.stillToReceive!),
      amountValue: c.stillToReceive,
      route: "Not applicable",
      status: "Payment pending",
      nextAction: NEXT.payment,
      overdueTag: null,
      isSample: c.isSample,
    });
  }

  rows.sort((a, b) => {
    const g = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    if (g !== 0) return g;
    if (a.group === "payments") return (b.amountValue ?? 0) - (a.amountValue ?? 0) || a.funderName.localeCompare(b.funderName);
    return (a.due ?? "").localeCompare(b.due ?? "") || a.funderName.localeCompare(b.funderName);
  });

  const funding = fundingKpis(items);
  return {
    rows,
    kpis: {
      applicationsDueSoon: applicationsDueSoon(items, openCalls, today),
      paymentsPendingCount: tracker.length,
      paymentsPendingBalance: sum(tracker.map((c) => c.stillToReceive!)),
      openCallsNotInPipeline: unlinked.length,
      awardedOutstanding: funding.stillToReceive,
      awardedMissingAmount: funding.quality.awardedMissingAmount,
    },
  };
}
