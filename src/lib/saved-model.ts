/**
 * Pure "Saved for Later" model. A funder is saved when its latest decision is "snooze"; there is no
 * separate saved table. Funders are organizations only.
 */
import { COMPONENT_KEYS } from "@/config/scoring";
import type { ListRow } from "./queries";

export interface SavedDecision {
  funderId: number;
  /** Date the funder was saved, YYYY-MM-DD. */
  savedOn: string;
  /** Until when the Funders list hides it. After this date it reappears there (still saved). */
  snoozeUntil: string | null;
}

export interface FunderBasics {
  id: number;
  name: string;
  type: string;
  state: string | null;
  website: string | null;
  isSeed: boolean;
}

export interface SavedRow {
  /** Same shape as a Funders list row, so the existing detail panel works unchanged. */
  row: ListRow;
  savedOn: string;
  snoozeUntil: string | null;
  /** False when the funder has no fit score in the latest refresh. */
  scored: boolean;
  /** Already has a pipeline item; adding it again never creates a duplicate. */
  inPipeline: boolean;
}

const emptyComponents = () =>
  Object.fromEntries(COMPONENT_KEYS.map((k) => [k, { score: null, evidence: null, sourceUrl: null, weight: 0 }])) as ListRow["components"];

/** Best row for a funder: scored rows beat unscored ones, excluded rows come last. */
const rank = (r: ListRow) => (r.excludedReason ? -2 : (r.total ?? -1));

/**
 * One row per saved funder, newest first. Funders with a score use their best-scoring row from the latest
 * refresh. Funders without one still appear (from the funders table) with no score.
 */
export function buildSavedRows(input: {
  saved: SavedDecision[];
  ranked: ListRow[];
  funders: Map<number, FunderBasics>;
  openCalls: Map<number, { deadline: string | null; route: string | null }>;
  inPipeline: Set<number>;
}): SavedRow[] {
  const best = new Map<number, ListRow>();
  for (const r of input.ranked) {
    const cur = best.get(r.funderId);
    if (!cur || rank(r) > rank(cur)) best.set(r.funderId, r);
  }

  const out: SavedRow[] = [];
  for (const s of input.saved) {
    const ranked = best.get(s.funderId);
    let row: ListRow;
    if (ranked) {
      row = { ...ranked, decision: "snooze", snoozeUntil: s.snoozeUntil };
    } else {
      const f = input.funders.get(s.funderId);
      if (!f) continue; // funder no longer exists
      const call = input.openCalls.get(s.funderId);
      row = {
        // Negative id: unique and never equal to a real score id.
        scoreId: -f.id,
        funderId: f.id,
        opportunityId: null,
        name: f.name,
        title: null,
        type: f.type,
        state: f.state,
        total: null,
        band: null,
        confidence: null,
        reason: null,
        reasonSourceUrl: null,
        excludedReason: null,
        isShortlisted: false,
        isOpen: !!call,
        deadline: call?.deadline ?? null,
        route: call?.route ?? null,
        filingYear: null,
        website: f.website,
        isSeed: f.isSeed,
        isNew: false,
        decision: "snooze",
        snoozeUntil: s.snoozeUntil,
        components: emptyComponents(),
      };
    }
    out.push({ row, savedOn: s.savedOn, snoozeUntil: s.snoozeUntil, scored: row.total !== null, inPipeline: input.inPipeline.has(s.funderId) });
  }
  return out.sort((a, b) => b.savedOn.localeCompare(a.savedOn) || a.row.name.localeCompare(b.row.name));
}

/** "2026-11-14" → "Nov 14, 2026". UTC-based so the server and browser always print the same text. */
export function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** True while the Funders list still hides this funder (the 30-day "snooze" window). */
export const isHiddenFromList = (snoozeUntil: string | null, today: string): boolean => snoozeUntil !== null && snoozeUntil > today;
