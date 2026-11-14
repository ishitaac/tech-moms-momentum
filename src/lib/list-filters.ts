import type { ListRow } from "./queries";

export const VIEWS = ["shortlist", "all", "excluded"] as const;
export const TYPES = ["state", "federal", "corporate", "foundation", "family_foundation"] as const;
export const BANDS_LIST = ["Strong", "Worth a look", "Long shot"] as const;

export interface Filters {
  view: (typeof VIEWS)[number];
  type: (typeof TYPES)[number] | null;
  band: (typeof BANDS_LIST)[number] | null;
  openOnly: boolean;
  q: string;
}

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const pick = <T extends readonly string[]>(list: T, v: string): T[number] | null =>
  (list as readonly string[]).includes(v) ? (v as T[number]) : null;

const MAX_QUERY_CHARS = 80;

export function parseFilters(p: Params): Filters {
  return {
    view: pick(VIEWS, one(p.view)) ?? "shortlist",
    type: pick(TYPES, one(p.type)),
    band: pick(BANDS_LIST, one(p.band)),
    openOnly: one(p.open) === "1",
    q: one(p.q).trim().slice(0, MAX_QUERY_CHARS),
  };
}

function isHiddenByDecision(r: ListRow, today: string): boolean {
  if (r.decision === "reject") return true;
  return r.decision === "snooze" && r.snoozeUntil !== null && r.snoozeUntil > today;
}

export function filterRows(rows: ListRow[], f: Filters, today: string): ListRow[] {
  const q = f.q.toLowerCase();
  return rows.filter((r) => {
    if (f.view === "excluded") return r.excludedReason !== null;
    if (r.excludedReason !== null || r.total === null) return false;
    if (f.view === "shortlist" && !r.isShortlisted) return false;
    if (isHiddenByDecision(r, today)) return false;
    if (f.type && r.type !== f.type) return false;
    if (f.band && r.band !== f.band) return false;
    if (f.openOnly && !r.isOpen) return false;
    if (q && !`${r.name} ${r.title ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
