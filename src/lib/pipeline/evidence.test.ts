import { describe, expect, test } from "vitest";
import { foundationFitInput, governmentFitInput, type FoundationFacts } from "./evidence";

const base: FoundationFacts = {
  funder: { ein: "123456789", name: "Acme Family Foundation", type: "family_foundation", state: "UT", acceptsUnsolicited: true, latestFilingYear: 2024 },
  filing: { taxYear: 2024, totalGiving: 120_000, sourceUrl: "https://pp/123" },
  grants: [
    { recipientName: "Women Tech Council", recipientState: "UT", amount: 20_000, purpose: "Workforce training for women in tech" },
    { recipientName: "Utah Food Bank", recipientState: "UT", amount: 10_000, purpose: "General support" },
    { recipientName: "Harvard University", recipientState: "MA", amount: 30_000, purpose: "Scholarships" },
  ],
  peerNames: new Set(["WOMEN TECH COUNCIL"]),
  latestAvailableYear: 2025,
  missionAiRating: null,
  websiteText: null,
  openCall: null,
};

describe("foundationFitInput", () => {
  const input = foundationFitInput(base);

  test("passes gates for an active foundation that accepts requests", () => {
    expect(input.gates.every((g) => g.passed)).toBe(true);
  });

  test("geography evidence states the Utah dollar share", () => {
    expect(input.components.geography.score).toBe(1);
    expect(input.components.geography.evidence).toBe("50% of grant dollars went to Utah (TY2024)");
    expect(input.components.geography.sourceUrl).toBe("https://pp/123");
  });

  test("mission evidence quotes matched keywords from grant purposes", () => {
    expect(input.components.mission.score).toBeGreaterThan(0);
    expect(input.components.mission.evidence).toContain("workforce");
  });

  test("women evidence names an example grantee", () => {
    expect(input.components.women.evidence).toContain("Women Tech Council");
  });

  test("history credits sweet-spot grants and peer overlap", () => {
    expect(input.components.history.evidence).toMatch(/typical grant \$20,000/i);
    expect(input.components.history.evidence).toContain("funded peer Women Tech Council");
  });

  test("access: accepts unsolicited + family foundation warm-intro path", () => {
    expect(input.components.access.score).toBeCloseTo(0.35);
    expect(input.components.access.evidence).toContain("Accepts unsolicited requests");
  });

  test("fails the open-to-asks gate when preselected only", () => {
    const r = foundationFitInput({ ...base, funder: { ...base.funder, acceptsUnsolicited: false } });
    expect(r.gates.find((g) => g.id === "open_to_asks")!.passed).toBe(false);
  });

  test("a past Tech-Moms funder skips gates and says so in history evidence", () => {
    const r = foundationFitInput({
      ...base,
      funder: { ...base.funder, acceptsUnsolicited: false },
      grants: [...base.grants, { recipientName: "TECH-MOMS", recipientState: "UT", amount: 10_000, purpose: "General" }],
    });
    expect(r.gates).toEqual([]);
    expect(r.components.history.evidence).toContain("Has funded Tech-Moms");
    expect(r.components.access.evidence).toContain("Past funder");
  });

  test("mission evidence reports the share of grants that match", () => {
    expect(input.components.mission.evidence).toMatch(/^33% of past grants mention/);
  });

  test("no filing at all (corporate program): no gates, not excluded", () => {
    const r = foundationFitInput({ ...base, filing: null, grants: [] });
    expect(r.gates).toEqual([]);
  });

  test("no grants: active gate fails", () => {
    const r = foundationFitInput({ ...base, grants: [] });
    expect(r.gates.find((g) => g.id === "active")!.passed).toBe(false);
  });

  test("an open call adds access points with the deadline", () => {
    const r = foundationFitInput({ ...base, openCall: { deadline: "2026-12-15", route: "loi", sourceUrl: "https://acme.org/apply" } });
    expect(r.components.access.score).toBeCloseTo(1);
    expect(r.components.access.evidence).toContain("Open call (LOI) due 2026-12-15");
  });
});

describe("governmentFitInput", () => {
  test("scores from the listing and leaves women/peer-history out when absent", () => {
    const r = governmentFitInput(
      {
        title: "Utah Women in the Workforce Grant",
        description: "Supports workforce training and digital skills for women returning to work.",
        eligibility: "Utah nonprofits",
        geography: "State of Utah",
        awardMin: 10_000,
        awardMax: 50_000,
        deadline: "2026-12-31",
        route: "direct",
        sourceUrl: "https://jobs.utah.gov/grant",
      },
      new Date("2026-11-13"),
    );
    expect(r.gates[0].passed).toBe(true);
    expect(r.components.geography.score).toBe(1);
    expect(r.components.mission.score).toBeGreaterThanOrEqual(0.5);
    expect(r.components.women.score).toBeGreaterThan(0);
    expect(r.components.access.score).toBeCloseTo(0.5);
    expect(r.components.history.evidence).toBe("Awards $10,000–$50,000");
  });
});
