/**
 * SAMPLE data fixture for the demo (pure: no database access, so it can be unit tested).
 * scripts/seed.ts reads this and writes it. NOTHING here runs until someone runs `npm run db:seed`.
 *
 * Rules this fixture follows:
 * - Every pipeline item it creates is flagged is_sample = true, and the UI shows SAMPLE on it.
 * - Sample funders are ONLY type "state" or "federal". The refresh (src/lib/pipeline/score-all.ts) scores every
 *   funder that is not federal/state, so a sample foundation, family foundation or corporate funder would be
 *   scored and leak into the Funders list. State/federal funders are only scored through open opportunities,
 *   and the fixture never creates any. (Corporate sample items reuse the four real seeded corporates.)
 * - Funders are organizations only; no donor, staff or participant data.
 */

export type SampleStage = "prospect" | "loi" | "submitted" | "awarded" | "declined";

/** A fixed date, or a date relative to the day the seed runs (so deadlines stay "soon" whenever it is run). */
export type DateSpec = string | { daysAgo: number } | { inDays: number };

export function resolveDate(spec: DateSpec, today: string): string {
  if (typeof spec === "string") return spec;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ("inDays" in spec ? spec.inDays : -spec.daysAgo));
  return d.toISOString().slice(0, 10);
}

/** The corporate funders Robbyn named (PRD interview). Real organizations, not sample. */
export const CORPORATE_SEEDS = [
  { name: "Adobe", website: "https://www.adobe.com/corporate-responsibility.html" },
  { name: "Meta", website: "https://about.meta.com/community/" },
  { name: "Weave", website: "https://www.getweave.com/" },
  { name: "Ancestry", website: "https://www.ancestry.com/corporate/" },
] as const;

export interface SampleFunder {
  name: string;
  website: string | null;
  type: "state" | "federal";
  state: string | null;
}

/** Clearly fictional organizations. Names start with "Sample " so they are recognizable anywhere they appear. */
export const SAMPLE_FUNDERS: SampleFunder[] = [
  { name: "Sample State Workforce Office", website: null, type: "state", state: "UT" },
  { name: "Sample State Education Fund", website: null, type: "state", state: "UT" },
  { name: "Sample State Women in Tech Initiative", website: null, type: "state", state: "UT" },
  { name: "Sample Federal STEM Program", website: null, type: "federal", state: null },
  { name: "Sample Federal Workforce Program", website: null, type: "federal", state: null },
];

export interface SampleItem {
  /** A CORPORATE_SEEDS name or a SAMPLE_FUNDERS name. */
  funder: string;
  stage: SampleStage;
  asked: number | null;
  awarded: number | null;
  awardedOn: DateSpec | null;
  deadline: DateSpec | null;
  payments: { amount: number; on: DateSpec }[];
}

const state = (i: number) => SAMPLE_FUNDERS[i].name;
const fed = (i: number) => SAMPLE_FUNDERS[3 + i].name;
const open = (funder: string, stage: SampleStage, asked: number, deadline: DateSpec | null = null): SampleItem => ({ funder, stage, asked, awarded: null, awardedOn: null, deadline, payments: [] });

/**
 * Corporate: the original four sample items, unchanged (2 awards fully paid, one Submitted, one LOI).
 * State: 6 decided (3 awards, 3 declines, about 50%), plus one overdue, one due this week and one due in 3 weeks.
 *        One award is deliberately overpaid, to show the data-quality note.
 * Federal: 11 decided (1 award, 10 declines, about 1 in 10), one award with no payment yet, one open application.
 * Awards are $5K-$30K.
 */
export const SAMPLE_ITEMS: SampleItem[] = [
  // Corporate (existing)
  { funder: "Adobe", stage: "awarded", asked: 25_000, awarded: 25_000, awardedOn: "2026-07-15", deadline: null, payments: [{ amount: 12_500, on: "2026-07-15" }, { amount: 12_500, on: "2026-10-15" }] },
  { funder: "Meta", stage: "awarded", asked: 30_000, awarded: 20_000, awardedOn: "2026-09-01", deadline: null, payments: [{ amount: 20_000, on: "2026-09-01" }] },
  open("Weave", "submitted", 10_000),
  open("Ancestry", "loi", 15_000),

  // State
  { funder: state(0), stage: "awarded", asked: 10_000, awarded: 8_000, awardedOn: { daysAgo: 120 }, deadline: null, payments: [{ amount: 8_000, on: { daysAgo: 100 } }] }, // fully received
  { funder: state(1), stage: "awarded", asked: 20_000, awarded: 15_000, awardedOn: { daysAgo: 90 }, deadline: null, payments: [{ amount: 16_000, on: { daysAgo: 60 } }] }, // overpaid by $1,000
  { funder: state(2), stage: "awarded", asked: 25_000, awarded: 22_000, awardedOn: { daysAgo: 60 }, deadline: null, payments: [{ amount: 10_000, on: { daysAgo: 30 } }] }, // partial
  open(state(0), "declined", 12_000),
  open(state(1), "declined", 18_000),
  open(state(2), "declined", 9_000),
  open(state(0), "submitted", 14_000, { inDays: 5 }), // due within 7 days
  open(state(1), "loi", 20_000, { inDays: 21 }), // due within 30 days
  open(state(2), "prospect", 7_500, { daysAgo: 3 }), // overdue

  // Federal
  { funder: fed(0), stage: "awarded", asked: 30_000, awarded: 18_000, awardedOn: { daysAgo: 45 }, deadline: null, payments: [] }, // awarded, nothing paid yet
  ...[30_000, 40_000, 50_000, 25_000, 60_000, 35_000, 45_000, 80_000, 100_000, 28_000].map((asked, i) => open(fed(i % 2), "declined", asked)),
  open(fed(1), "submitted", 90_000, { inDays: 45 }),
];

export interface SampleRows {
  item: {
    funderId: number;
    stage: SampleStage;
    amountAsked: number | null;
    amountAwarded: number | null;
    awardedOn: string | null;
    deadline: string | null;
    isSample: true;
    notes: string;
  };
  payments: { amount: number; receivedOn: string }[];
}

/** Turns the fixture into insert rows. Deterministic: same input, same rows, so re-running never changes the counts. */
export function buildSampleRows(funderIdByName: Map<string, number>, today: string): SampleRows[] {
  return SAMPLE_ITEMS.map((s) => {
    const funderId = funderIdByName.get(s.funder);
    if (funderId === undefined) throw new Error(`Sample item refers to an unknown funder: ${s.funder}`);
    return {
      item: {
        funderId,
        stage: s.stage,
        amountAsked: s.asked,
        amountAwarded: s.awarded,
        awardedOn: s.awardedOn ? resolveDate(s.awardedOn, today) : null,
        deadline: s.deadline ? resolveDate(s.deadline, today) : null,
        isSample: true,
        notes: "Sample data for the demo",
      },
      payments: s.payments.map((p) => ({ amount: p.amount, receivedOn: resolveDate(p.on, today) })),
    };
  });
}

/**
 * Which existing pipeline items the seed may delete before re-inserting: ONLY rows flagged is_sample.
 * Real items are never returned. Their payments go with them (payments.pipeline_item_id cascades).
 */
export function planSampleReset(existing: { id: number; isSample: boolean }[]): number[] {
  return existing.filter((i) => i.isSample === true).map((i) => i.id);
}
