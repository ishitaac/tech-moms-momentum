import type { FitResult } from "./types";

const MAX_REASON_CHARS = 220;

export interface Reason {
  text: string;
  sourceUrl: string | null;
}

/** Deterministic "why this match" built only from evidence of the top score drivers. */
export function buildReason(fit: FitResult): Reason {
  if (fit.excludedReason) return { text: `Excluded: ${fit.excludedReason}.`, sourceUrl: null };

  const parts = fit.drivers
    .map((k) => fit.components[k])
    .filter((c) => c.evidence);
  if (parts.length === 0) {
    return { text: "Unknown — not enough public evidence yet.", sourceUrl: null };
  }
  return {
    text: parts.map((c) => c.evidence).join("; ") + ".",
    sourceUrl: parts.find((c) => c.sourceUrl)?.sourceUrl ?? null,
  };
}

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const numbersIn = (s: string) => new Set((s.match(NUMBER) ?? []).map((n) => n.replace(/,/g, "")));

/**
 * Guard for the optional AI polish step: the rewrite may rephrase but must not
 * introduce any number that isn't in the source facts, and must stay one short line.
 */
export function isFaithfulRewrite(facts: string, rewrite: string): boolean {
  const trimmed = rewrite.trim();
  if (!trimmed || trimmed.length > MAX_REASON_CHARS || trimmed.includes("\n")) return false;
  const allowed = numbersIn(facts);
  return [...numbersIn(trimmed)].every((n) => allowed.has(n));
}
