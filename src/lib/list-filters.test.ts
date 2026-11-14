import { describe, expect, test } from "vitest";
import { filterRows, parseFilters } from "./list-filters";
import type { ListRow } from "./queries";

const row = (p: Partial<ListRow>): ListRow =>
  ({
    scoreId: 1,
    funderId: 1,
    opportunityId: null,
    name: "Acme Foundation",
    title: null,
    type: "foundation",
    state: "UT",
    total: 60,
    band: "Strong",
    confidence: "high",
    reason: "",
    reasonSourceUrl: null,
    excludedReason: null,
    isShortlisted: true,
    isOpen: false,
    deadline: null,
    route: null,
    filingYear: 2024,
    website: null,
    isSeed: false,
    isNew: false,
    decision: null,
    snoozeUntil: null,
    components: {} as ListRow["components"],
    ...p,
  }) as ListRow;

const today = "2026-11-13";

describe("parseFilters", () => {
  test("defaults to the shortlist view", () => {
    expect(parseFilters({})).toEqual({ view: "shortlist", type: null, band: null, openOnly: false, q: "" });
  });

  test("ignores unknown values", () => {
    expect(parseFilters({ type: "bogus", band: "Nope", view: "weird" }).type).toBeNull();
    expect(parseFilters({ view: "weird" }).view).toBe("shortlist");
  });
});

describe("filterRows", () => {
  test("shortlist view hides non-shortlisted, excluded, rejected and active snoozes", () => {
    const rows = [
      row({ funderId: 1 }),
      row({ funderId: 2, isShortlisted: false }),
      row({ funderId: 3, excludedReason: "No grants since 2019" }),
      row({ funderId: 4, decision: "reject" }),
      row({ funderId: 5, decision: "snooze", snoozeUntil: "2026-12-01" }),
      row({ funderId: 6, decision: "snooze", snoozeUntil: "2026-11-01" }),
    ];
    expect(filterRows(rows, parseFilters({}), today).map((r) => r.funderId)).toEqual([1, 6]);
  });

  test("excluded view shows only gated-out rows", () => {
    const rows = [row({ funderId: 1 }), row({ funderId: 3, excludedReason: "x" })];
    expect(filterRows(rows, parseFilters({ view: "excluded" }), today).map((r) => r.funderId)).toEqual([3]);
  });

  test("filters by type, band, open call and search text", () => {
    const rows = [
      row({ funderId: 1, type: "state", band: "Strong", isOpen: true, name: "Utah DWS", title: "TANF Grant" }),
      row({ funderId: 2, type: "foundation", band: "Strong" }),
      row({ funderId: 3, type: "state", band: "Long shot", isOpen: true }),
    ];
    const f = parseFilters({ type: "state", band: "Strong", open: "1", q: "tanf" });
    expect(filterRows(rows, f, today).map((r) => r.funderId)).toEqual([1]);
  });
});
