import type { Band, ComponentKey, Confidence } from "@/config/scoring";

export interface ComponentResult {
  /** 0-1, or null when there is no evidence (excluded from the score, lowers confidence). */
  score: number | null;
  /** Human-readable evidence, used to build the "why this match" line. */
  evidence: string | null;
  sourceUrl: string | null;
}

export type GateId = "active" | "open_to_asks" | "live_listing";

export interface GateResult {
  id: GateId;
  passed: boolean;
  reason: string;
}

export interface FitInput {
  components: Record<ComponentKey, ComponentResult>;
  gates: GateResult[];
}

export interface FitResult {
  total: number | null;
  band: Band | null;
  /** True when the score qualified for Strong but evidence was too thin. */
  bandCapped: boolean;
  confidence: Confidence;
  evidenceCount: number;
  excludedReason: string | null;
  /** Components ordered by weighted contribution, top 2. */
  drivers: ComponentKey[];
  components: Record<ComponentKey, ComponentResult & { weight: number }>;
  gates: GateResult[];
}
