import { describe, expect, test } from "vitest";
import { buildReason, isFaithfulRewrite } from "./reason";
import type { FitResult } from "./types";

function fit(partial: Partial<FitResult>): FitResult {
  const empty = { score: null, evidence: null, sourceUrl: null, weight: 0.2 };
  return {
    total: 80,
    band: "Strong",
    bandCapped: false,
    confidence: "high",
    evidenceCount: 5,
    excludedReason: null,
    drivers: [],
    gates: [],
    components: { mission: empty, women: empty, geography: empty, history: empty, access: empty },
    ...partial,
  };
}

describe("buildReason", () => {
  test("joins evidence from the top two drivers and cites the first source", () => {
    const r = buildReason(
      fit({
        drivers: ["geography", "mission"],
        components: {
          mission: { score: 0.9, evidence: "funds workforce and coding programs", sourceUrl: "https://a.org/990", weight: 0.35 },
          geography: { score: 1, evidence: "62% of grant dollars went to Utah", sourceUrl: "https://irs/990pf", weight: 0.2 },
          women: { score: null, evidence: null, sourceUrl: null, weight: 0.15 },
          history: { score: null, evidence: null, sourceUrl: null, weight: 0.2 },
          access: { score: null, evidence: null, sourceUrl: null, weight: 0.1 },
        },
      }),
    );
    expect(r.text).toBe("62% of grant dollars went to Utah; funds workforce and coding programs.");
    expect(r.sourceUrl).toBe("https://irs/990pf");
  });

  test("says unknown when there are no drivers", () => {
    const r = buildReason(fit({ drivers: [] }));
    expect(r.text).toMatch(/^Unknown/);
    expect(r.sourceUrl).toBeNull();
  });

  test("uses the excluded reason for gated funders", () => {
    expect(buildReason(fit({ excludedReason: "No grants since 2019" })).text).toBe("Excluded: No grants since 2019.");
  });
});

describe("isFaithfulRewrite", () => {
  const facts = "62% of grant dollars went to Utah; typical grant $15,000.";

  test("accepts a rewrite that keeps the same numbers", () => {
    expect(isFaithfulRewrite(facts, "Gives 62% of its dollars in Utah, usually around $15,000 per grant.")).toBe(true);
  });

  test("rejects a rewrite that invents a number", () => {
    expect(isFaithfulRewrite(facts, "Gives 62% in Utah and funded 40 nonprofits like Tech-Moms.")).toBe(false);
  });

  test("rejects empty or overlong rewrites", () => {
    expect(isFaithfulRewrite(facts, "")).toBe(false);
    expect(isFaithfulRewrite(facts, "x".repeat(400))).toBe(false);
  });
});
