import {
  BANDS,
  COMPONENT_KEYS,
  CONFIDENCE,
  type Band,
  type ComponentKey,
  type Confidence,
  type Weights,
} from "@/config/scoring";
import type { FitInput, FitResult } from "./types";

const DRIVER_COUNT = 2;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function bandFor(total: number, evidenceCount: number): { band: Band; capped: boolean } {
  if (total >= BANDS.strongMin) {
    if (evidenceCount >= BANDS.strongMinEvidence) return { band: "Strong", capped: false };
    return { band: "Worth a look", capped: true };
  }
  if (total >= BANDS.worthMin) return { band: "Worth a look", capped: false };
  return { band: "Long shot", capped: false };
}

function confidenceFor(evidenceCount: number): Confidence {
  const share = evidenceCount / COMPONENT_KEYS.length;
  if (share >= CONFIDENCE.highMin) return "high";
  if (share >= CONFIDENCE.mediumMin) return "medium";
  return "low";
}

/**
 * Fit = gates passed × Σ(weight × score) / Σ(weight), over components that have evidence.
 * Components with no evidence are excluded (not scored as 0) and lower confidence instead.
 */
export function computeFit(input: FitInput, weights: Weights): FitResult {
  const known = COMPONENT_KEYS.filter((k) => input.components[k].score !== null);
  const evidenceCount = known.length;
  const confidence = confidenceFor(evidenceCount);

  const components = Object.fromEntries(
    COMPONENT_KEYS.map((k) => {
      const comp = input.components[k];
      const score = comp.score === null ? null : clamp01(comp.score);
      return [k, { ...comp, score, weight: weights[k] }];
    }),
  ) as FitResult["components"];

  const failedGate = input.gates.find((g) => !g.passed);
  const base = { components, gates: input.gates, confidence, evidenceCount };

  if (failedGate) {
    return { ...base, total: null, band: null, bandCapped: false, excludedReason: failedGate.reason, drivers: [] };
  }

  const weightSum = known.reduce((sum, k) => sum + weights[k], 0);
  if (evidenceCount === 0 || weightSum === 0) {
    return { ...base, total: null, band: null, bandCapped: false, excludedReason: null, drivers: [] };
  }

  const contribution = (k: ComponentKey) => weights[k] * (components[k].score ?? 0);
  const weighted = known.reduce((sum, k) => sum + contribution(k), 0);
  // Round away float noise (0.55 * w / w can land at 54.999…).
  const total = Math.round(Number(((100 * weighted) / weightSum).toFixed(6)));
  const { band, capped } = bandFor(total, evidenceCount);

  const drivers = [...known]
    .filter((k) => contribution(k) > 0)
    .sort((a, b) => contribution(b) - contribution(a))
    .slice(0, DRIVER_COUNT);

  return { ...base, total, band, bandCapped: capped, excludedReason: null, drivers };
}
