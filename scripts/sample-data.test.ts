import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { actionCenter, collectionTracker, fundingKpis, strategyRows, type ReportItem } from "../src/lib/reports-model";
import { buildSampleRows, CORPORATE_SEEDS, planSampleReset, resolveDate, SAMPLE_FUNDERS, SAMPLE_ITEMS, type SampleRows } from "./sample-data";

const TODAY = "2026-11-14";

const typeOf = (name: string) => SAMPLE_FUNDERS.find((f) => f.name === name)?.type ?? "corporate";

/** Fixture rows as the report model sees them (in memory; nothing touches a database). */
function asReportItems(rows: SampleRows[]): ReportItem[] {
  const names = [...CORPORATE_SEEDS.map((c) => c.name), ...SAMPLE_FUNDERS.map((f) => f.name)];
  return rows.map((r, i) => {
    const name = SAMPLE_ITEMS[i].funder;
    return {
      id: i + 1,
      funderId: names.indexOf(name) + 1,
      funderName: name,
      funderType: typeOf(name),
      stage: r.item.stage,
      amountAsked: r.item.amountAsked,
      amountAwarded: r.item.amountAwarded,
      deadline: r.item.deadline,
      awardedOn: r.item.awardedOn,
      isSample: r.item.isSample,
      opportunityId: null,
      opportunityTitle: null,
      opportunityDeadline: null,
      route: null,
      received: r.payments.reduce((s, p) => s + p.amount, 0),
    };
  });
}

const idByName = () => new Map([...CORPORATE_SEEDS.map((c) => c.name), ...SAMPLE_FUNDERS.map((f) => f.name)].map((n, i) => [n as string, i + 1]));

describe("fixture shape", () => {
  it("every item refers to a known funder, and every built row is flagged is_sample", () => {
    const rows = buildSampleRows(idByName(), TODAY);
    expect(rows).toHaveLength(SAMPLE_ITEMS.length);
    expect(rows.every((r) => r.item.isSample === true)).toBe(true);
    expect(() => buildSampleRows(new Map(), TODAY)).toThrow(/unknown funder/);
  });

  it("sample funders are uniquely named 'Sample ...' organizations, and only state or federal (never scored by the refresh)", () => {
    const names = SAMPLE_FUNDERS.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.startsWith("Sample "))).toBe(true);
    expect(SAMPLE_FUNDERS.every((f) => f.type === "state" || f.type === "federal")).toBe(true);
    // No sample name collides with a real seeded corporate funder.
    expect(names.some((n) => CORPORATE_SEEDS.some((c) => c.name === n))).toBe(false);
  });

  it("the refresh still scores every non-government funder directly, which is why sample funders must be state or federal", () => {
    const src = readFileSync("src/lib/pipeline/score-all.ts", "utf8");
    expect(src).toMatch(/GOV_TYPES\s*=\s*new Set\(\["federal",\s*"state"\]\)/);
    expect(src).toMatch(/funders\.filter\(\(f\)\s*=>\s*!GOV_TYPES\.has\(f\.type\)\)/);
  });

  it("creates no opportunities, so government sample funders get no scores (the seed only inserts settings, funders, items and payments)", () => {
    const src = readFileSync("scripts/seed.ts", "utf8");
    expect(src).not.toMatch(/schema\.(opportunities|scores|decisions)/);
  });

  it("awards are $5K-$30K and each type has a realistic outcome history", () => {
    const items = asReportItems(buildSampleRows(idByName(), TODAY));
    for (const i of items.filter((x) => x.stage === "awarded")) {
      expect(i.amountAwarded!).toBeGreaterThanOrEqual(5_000);
      expect(i.amountAwarded!).toBeLessThanOrEqual(30_000);
    }
    const by = Object.fromEntries(strategyRows(items).map((r) => [r.type, r]));
    expect(by.state).toMatchObject({ decided: 6, awards: 3, winRate: 0.5 }); // about 50%
    expect(by.federal).toMatchObject({ decided: 11, awards: 1, enoughData: true }); // about 1 in 10
    expect(by.federal.winRate!).toBeLessThan(0.1);
    expect(by.corporate).toMatchObject({ decided: 2, winRate: null }); // fewer than 5 decided: Not enough data
    expect(by.foundation.items + by.family_foundation.items).toBe(0); // no sample foundations (they would be scored)
    expect(by.state.action).toBe("Prioritize Utah and state opportunities");
    expect(by.federal.action).toBe("Apply selectively to national grants");
  });

  it("covers the report scenarios: no payment, partial, fully received, overpaid, and deadlines this week, within 30 days, beyond 30 days and overdue", () => {
    const items = asReportItems(buildSampleRows(idByName(), TODAY));
    const k = fundingKpis(items);
    expect(k.quality.overpaid).toHaveLength(1);
    expect(k.stillToReceive).toBe(30_000); // 12,000 (partial) + 18,000 (no payment); the overpaid award adds nothing
    const tracker = collectionTracker(items);
    expect(tracker.some((r) => r.received === 0 && r.stillToReceive! > 0)).toBe(true); // awarded, no payment
    expect(tracker.some((r) => r.received > 0 && r.stillToReceive! > 0)).toBe(true); // partial
    expect(tracker.some((r) => r.nextAction === "Fully received")).toBe(true);
    const { rows, kpis } = actionCenter(items, [], TODAY);
    expect(rows.filter((r) => r.kind !== "payment").map((r) => r.group)).toEqual(["overdue", "this-week", "next-30", "later"]);
    expect(rows.filter((r) => r.kind === "payment")).toHaveLength(2);
    expect(kpis.applicationsDueSoon).toBe(2);
  });
});

describe("dates", () => {
  it("resolves fixed and relative dates", () => {
    expect(resolveDate("2026-07-15", TODAY)).toBe("2026-07-15");
    expect(resolveDate({ inDays: 5 }, TODAY)).toBe("2026-11-19");
    expect(resolveDate({ daysAgo: 3 }, TODAY)).toBe("2026-11-11");
    expect(resolveDate({ inDays: 20 }, "2026-12-20")).toBe("2027-01-09");
  });
});

describe("cleanup removes only is_sample pipeline items", () => {
  it("returns only sample ids, never real ones", () => {
    const existing = [
      { id: 1, isSample: false },
      { id: 2, isSample: true },
      { id: 3, isSample: false },
      { id: 4, isSample: true },
    ];
    expect(planSampleReset(existing)).toEqual([2, 4]);
    expect(planSampleReset([{ id: 9, isSample: false }])).toEqual([]);
    expect(planSampleReset([])).toEqual([]);
  });

  it("seed.ts deletes by that id list AND is_sample, and has no other delete of pipeline items", () => {
    const src = readFileSync("scripts/seed.ts", "utf8");
    expect(src).toContain("planSampleReset(existing)");
    expect(src).toMatch(/\.delete\(schema\.pipelineItems\)\.where\(and\(inArray\(schema\.pipelineItems\.id, toDelete\), eq\(schema\.pipelineItems\.isSample, true\)\)\)/);
    expect(src.match(/\.delete\(/g)).toHaveLength(1);
    expect(src).not.toMatch(/\.delete\(schema\.(funders|payments|settings|scores|decisions|notifications)/);
  });
});

describe("re-running the seed gives the same counts", () => {
  interface Store {
    funders: Map<string, number>;
    items: { id: number; isSample: boolean }[];
    payments: { itemId: number; amount: number }[];
    nextId: number;
  }

  /** Mirrors seed.ts using the same helpers: upsert funders by name, delete sample items (payments cascade), insert. */
  function seedOnce(s: Store) {
    for (const name of [...CORPORATE_SEEDS.map((c) => c.name), ...SAMPLE_FUNDERS.map((f) => f.name)]) if (!s.funders.has(name)) s.funders.set(name, s.funders.size + 1);
    const gone = new Set(planSampleReset(s.items));
    s.items = s.items.filter((i) => !gone.has(i.id));
    s.payments = s.payments.filter((p) => !gone.has(p.itemId));
    for (const { item, payments } of buildSampleRows(s.funders, TODAY)) {
      const id = s.nextId++;
      s.items.push({ id, isSample: item.isSample });
      for (const p of payments) s.payments.push({ itemId: id, amount: p.amount });
    }
  }

  it("a second and third run do not duplicate sample items, payments or funders, and never touch real items or their payments", () => {
    const s: Store = {
      funders: new Map(),
      items: [
        { id: 900, isSample: false },
        { id: 901, isSample: false },
      ],
      payments: [
        { itemId: 900, amount: 5_000 },
        { itemId: 901, amount: 7_500 },
      ],
      nextId: 1000,
    };
    const snapshot = () => ({
      sample: s.items.filter((i) => i.isSample).length,
      real: s.items.filter((i) => !i.isSample).map((i) => i.id),
      realPayments: s.payments.filter((p) => p.itemId >= 900 && p.itemId <= 901),
      samplePayments: s.payments.filter((p) => p.itemId >= 1000).length,
      funders: s.funders.size,
    });

    seedOnce(s);
    const first = snapshot();
    expect(first.sample).toBe(SAMPLE_ITEMS.length);
    expect(first.funders).toBe(CORPORATE_SEEDS.length + SAMPLE_FUNDERS.length);
    seedOnce(s);
    seedOnce(s);
    const third = snapshot();

    expect(third).toEqual(first); // identical counts after re-running
    expect(third.real).toEqual([900, 901]);
    expect(third.realPayments).toEqual([
      { itemId: 900, amount: 5_000 },
      { itemId: 901, amount: 7_500 },
    ]);
  });
});
