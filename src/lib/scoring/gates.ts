import { GATES } from "@/config/scoring";
import type { GateResult } from "./types";

export interface FoundationGateInput {
  latestGrantYear: number | null;
  /** Most recent tax year we have filings for (990s lag, so don't compare to today). */
  latestAvailableYear: number;
  /** 990-PF "contributes only to preselected organizations" checkbox; null = unknown. */
  preselectedOnly: boolean | null;
}

export function foundationGates(input: FoundationGateInput): GateResult[] {
  const active: GateResult =
    input.latestGrantYear === null
      ? { id: "active", passed: false, reason: "No grants found in available filings" }
      : input.latestAvailableYear - input.latestGrantYear <= GATES.activeWithinYears
        ? { id: "active", passed: true, reason: `Gave grants in ${input.latestGrantYear}` }
        : { id: "active", passed: false, reason: `No grants since ${input.latestGrantYear}` };

  const openToAsks: GateResult =
    input.preselectedOnly === true
      ? { id: "open_to_asks", passed: false, reason: "Gives only to preselected organizations (990-PF)" }
      : {
          id: "open_to_asks",
          passed: true,
          reason: input.preselectedOnly === false ? "Accepts new requests" : "Preselected-only status unknown",
        };

  return [active, openToAsks];
}

export interface GovGateInput {
  hasListing: boolean;
  /** ISO date (YYYY-MM-DD) or null for rolling. */
  deadline: string | null;
}

export function governmentGates(input: GovGateInput, today: Date = new Date()): GateResult[] {
  if (!input.hasListing) {
    return [{ id: "live_listing", passed: false, reason: "No live opportunity listing" }];
  }
  if (input.deadline) {
    const todayIso = today.toISOString().slice(0, 10);
    if (input.deadline < todayIso) {
      return [{ id: "live_listing", passed: false, reason: `Deadline passed (${input.deadline})` }];
    }
  }
  return [{ id: "live_listing", passed: true, reason: "Live listing" }];
}
