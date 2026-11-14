import { describe, expect, test } from "vitest";
import { distinctByMonth, fundingMix, giftRanges, winRateByType } from "./dashboard-model";
import type { PaymentRow, PipelineCard } from "./pipeline-model";

const pay = (amount: number, receivedOn: string, funderName = "A", funderType = "corporate"): PaymentRow => ({
  pipelineItemId: 1,
  funderName,
  funderType,
  amount,
  receivedOn,
  isSample: false,
});

const card = (funderType: string, stage: PipelineCard["stage"]): PipelineCard => ({
  id: 1, funderId: 1, funderName: "A", funderType, opportunityTitle: null, stage,
  amountAsked: null, amountAwarded: null, received: 0, deadline: null, isSample: false,
});

describe("dashboard model", () => {
  test("giftRanges buckets by PRD bands with exclusive upper bounds", () => {
    const r = giftRanges([pay(500, "2026-01-01"), pay(5_000, "2026-01-01"), pay(30_000, "2026-01-01"), pay(29_999, "2026-01-01")]);
    expect(r.map((x) => x.count)).toEqual([1, 0, 1, 1, 1]);
  });

  test("fundingMix sums received dollars by funder type, largest first", () => {
    expect(fundingMix([pay(10, "2026-01-01", "A", "state"), pay(30, "2026-01-01", "B", "corporate"), pay(5, "2026-01-01", "C", "state")])).toEqual([
      { type: "corporate", amount: 30 },
      { type: "state", amount: 15 },
    ]);
  });

  test("winRateByType ignores open stages", () => {
    const r = winRateByType([card("state", "awarded"), card("state", "declined"), card("state", "submitted"), card("federal", "declined")]);
    expect(r).toEqual([
      { type: "state", won: 1, decided: 2, rate: 0.5 },
      { type: "federal", won: 0, decided: 1, rate: 0 },
    ]);
  });

  test("distinctByMonth counts gifts and distinct funders", () => {
    expect(distinctByMonth([pay(1, "2026-07-02", "A"), pay(1, "2026-07-20", "A"), pay(1, "2026-07-21", "B")])).toEqual([
      { month: "2026-07", gifts: 3, funders: 2 },
    ]);
  });
});
