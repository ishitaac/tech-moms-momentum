import { describe, expect, it } from "vitest";
import type { ListRow } from "./queries";
import { buildSavedRows, isHiddenFromList, longDate, type FunderBasics } from "./saved-model";

const row = (o: Partial<ListRow> = {}): ListRow => ({
  scoreId: 1,
  funderId: 1,
  opportunityId: null,
  name: "Funder",
  title: null,
  type: "foundation",
  state: "UT",
  total: 80,
  band: "Strong",
  confidence: "high",
  reason: "Funds women in tech.",
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
  ...o,
});

const basics = (id: number, name: string): FunderBasics => ({ id, name, type: "corporate", state: null, website: "https://x.org", isSeed: true });
const none = { openCalls: new Map(), inPipeline: new Set<number>() };

describe("buildSavedRows", () => {
  it("uses the best-scoring row per funder and marks the row as saved", () => {
    const rows = buildSavedRows({
      saved: [{ funderId: 1, savedOn: "2026-11-10", snoozeUntil: "2026-12-10" }],
      ranked: [row({ scoreId: 1, total: 40, opportunityId: 5 }), row({ scoreId: 2, total: 90, opportunityId: 6 })],
      funders: new Map(),
      ...none,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].row).toMatchObject({ scoreId: 2, total: 90, decision: "snooze", snoozeUntil: "2026-12-10" });
    expect(rows[0].scored).toBe(true);
  });

  it("still lists a saved funder with no score, with safe placeholder components", () => {
    const [r] = buildSavedRows({
      saved: [{ funderId: 7, savedOn: "2026-11-10", snoozeUntil: null }],
      ranked: [],
      funders: new Map([[7, basics(7, "Adobe")]]),
      openCalls: new Map([[7, { deadline: "2026-12-01", route: "direct" }]]),
      inPipeline: new Set(),
    });
    expect(r.scored).toBe(false);
    expect(r.row).toMatchObject({ name: "Adobe", total: null, band: null, reason: null, isOpen: true, deadline: "2026-12-01", decision: "snooze" });
    expect(r.row.scoreId).toBeLessThan(0);
    // The detail panel reads these for every scoring component, so none may be missing.
    expect(Object.keys(r.row.components).sort()).toEqual(["access", "geography", "history", "mission", "women"]);
    expect(r.row.components.mission).toMatchObject({ score: null, evidence: null, sourceUrl: null });
  });

  it("treats an excluded or unscored ranked row as not scored, and prefers a scored row over it", () => {
    const rows = buildSavedRows({
      saved: [
        { funderId: 1, savedOn: "2026-11-10", snoozeUntil: null },
        { funderId: 2, savedOn: "2026-11-09", snoozeUntil: null },
      ],
      ranked: [row({ funderId: 1, total: null, excludedReason: "Not accepting asks" }), row({ funderId: 1, scoreId: 9, total: 55 }), row({ funderId: 2, total: null, excludedReason: "Closed" })],
      funders: new Map(),
      ...none,
    });
    expect(rows.map((r) => [r.row.funderId, r.scored])).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it("skips a saved funder that no longer exists, flags pipeline funders, and sorts newest first", () => {
    const rows = buildSavedRows({
      saved: [
        { funderId: 1, savedOn: "2026-10-01", snoozeUntil: null },
        { funderId: 2, savedOn: "2026-11-05", snoozeUntil: null },
        { funderId: 3, savedOn: "2026-11-20", snoozeUntil: null },
      ],
      ranked: [],
      funders: new Map([
        [1, basics(1, "Old save")],
        [2, basics(2, "New save")],
      ]),
      openCalls: new Map(),
      inPipeline: new Set([2]),
    });
    expect(rows.map((r) => r.row.name)).toEqual(["New save", "Old save"]);
    expect(rows.map((r) => r.inPipeline)).toEqual([true, false]);
  });

  it("is empty when nothing is saved", () => {
    expect(buildSavedRows({ saved: [], ranked: [row()], funders: new Map(), ...none })).toEqual([]);
  });
});

describe("dates", () => {
  it("formats a date the same way everywhere", () => {
    expect(longDate("2026-11-14")).toBe("Nov 14, 2026");
    expect(longDate("not-a-date")).toBe("not-a-date");
  });

  it("knows whether the Funders list still hides a saved funder", () => {
    expect(isHiddenFromList("2026-12-01", "2026-11-14")).toBe(true);
    expect(isHiddenFromList("2026-11-14", "2026-11-14")).toBe(false);
    expect(isHiddenFromList(null, "2026-11-14")).toBe(false);
  });
});
