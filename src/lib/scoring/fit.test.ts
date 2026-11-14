import { describe, expect, test } from "vitest";
import { BANDS, DEFAULT_WEIGHTS } from "@/config/scoring";
import { computeFit } from "./fit";
import type { ComponentResult, FitInput } from "./types";

const c = (score: number | null): ComponentResult => ({
  score,
  evidence: score === null ? null : "evidence",
  sourceUrl: score === null ? null : "https://example.org/990",
});

const passing = [{ id: "active" as const, passed: true, reason: "Gave grants in 2024" }];

function input(scores: Partial<Record<keyof typeof DEFAULT_WEIGHTS, number | null>>): FitInput {
  return {
    components: {
      mission: c(scores.mission ?? null),
      women: c(scores.women ?? null),
      geography: c(scores.geography ?? null),
      history: c(scores.history ?? null),
      access: c(scores.access ?? null),
    },
    gates: passing,
  };
}

describe("computeFit", () => {
  test("weighted sum over all components scales to 0-100", () => {
    const result = computeFit(input({ mission: 1, women: 1, geography: 1, history: 1, access: 1 }), DEFAULT_WEIGHTS);
    expect(result.total).toBe(100);
    expect(result.band).toBe("Strong");
    expect(result.confidence).toBe("high");
  });

  test("renormalizes over components that have evidence", () => {
    // only mission (0.35) and geography (0.2) known: (0.35*0.8 + 0.2*0.4) / 0.55 = 0.6545
    const result = computeFit(input({ mission: 0.8, geography: 0.4 }), DEFAULT_WEIGHTS);
    expect(result.total).toBe(65);
    expect(result.evidenceCount).toBe(2);
  });

  test("caps a high score with thin evidence at 'Worth a look'", () => {
    const result = computeFit(input({ mission: 1, women: 1 }), DEFAULT_WEIGHTS);
    expect(result.total).toBe(100);
    expect(result.band).toBe("Worth a look");
    expect(result.bandCapped).toBe(true);
    expect(result.confidence).toBe("low");
  });

  test("allows Strong with exactly 3 evidenced components", () => {
    const result = computeFit(input({ mission: 0.9, women: 0.8, geography: 0.9 }), DEFAULT_WEIGHTS);
    expect(result.band).toBe("Strong");
    expect(result.confidence).toBe("medium");
  });

  test("band thresholds come from config (worthMin is Worth a look, one below is Long shot)", () => {
    const at = BANDS.worthMin / 100;
    const below = (BANDS.worthMin - 1) / 100;
    expect(computeFit(input({ mission: at, women: at, geography: at, history: at, access: at }), DEFAULT_WEIGHTS).band).toBe("Worth a look");
    expect(computeFit(input({ mission: below, women: below, geography: below, history: below, access: below }), DEFAULT_WEIGHTS).band).toBe("Long shot");
  });

  test("no evidence at all yields null score and low confidence", () => {
    const result = computeFit(input({}), DEFAULT_WEIGHTS);
    expect(result.total).toBeNull();
    expect(result.band).toBeNull();
    expect(result.confidence).toBe("low");
  });

  test("a failed gate excludes the funder with the gate's reason", () => {
    const result = computeFit(
      { ...input({ mission: 1, women: 1, geography: 1 }), gates: [{ id: "active", passed: false, reason: "No grants since 2019" }] },
      DEFAULT_WEIGHTS,
    );
    expect(result.excludedReason).toBe("No grants since 2019");
    expect(result.band).toBeNull();
  });

  test("drivers are the top contributing components by weighted score", () => {
    const result = computeFit(input({ mission: 0.9, women: 0.2, geography: 1, history: 0.1 }), DEFAULT_WEIGHTS);
    expect(result.drivers).toEqual(["mission", "geography"]);
  });

  test("custom weights change the ranking", () => {
    const geoHeavy = { ...DEFAULT_WEIGHTS, geography: 0.9, mission: 0.05 };
    const a = computeFit(input({ mission: 1, geography: 0, women: 0.5 }), geoHeavy);
    const b = computeFit(input({ mission: 1, geography: 0, women: 0.5 }), DEFAULT_WEIGHTS);
    expect(a.total!).toBeLessThan(b.total!);
  });

  test("clamps component scores outside 0-1", () => {
    const result = computeFit(input({ mission: 1.5, women: -1, geography: 1 }), DEFAULT_WEIGHTS);
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });
});
