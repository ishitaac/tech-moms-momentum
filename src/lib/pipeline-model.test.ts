import { describe, expect, test } from "vitest";
import { committedVsReceivedByMonth, stageTotal, type PipelineCard } from "./pipeline-model";

const card = (p: Partial<PipelineCard> & { awardedOn?: string | null }): PipelineCard & { awardedOn?: string | null } => ({
  id: 1,
  funderId: 1,
  funderName: "A",
  funderType: "foundation",
  opportunityTitle: null,
  stage: "prospect",
  amountAsked: null,
  amountAwarded: null,
  received: 0,
  deadline: null,
  isSample: false,
  ...p,
});

describe("stageTotal", () => {
  test("sums asked for open stages and awarded for Awarded", () => {
    const cards = [
      card({ stage: "submitted", amountAsked: 10_000 }),
      card({ stage: "submitted", amountAsked: 5_000 }),
      card({ stage: "awarded", amountAsked: 30_000, amountAwarded: 20_000 }),
    ];
    expect(stageTotal(cards, "submitted")).toBe(15_000);
    expect(stageTotal(cards, "awarded")).toBe(20_000);
    expect(stageTotal(cards, "loi")).toBe(0);
  });
});

describe("committedVsReceivedByMonth", () => {
  test("committed by award month, received by payment month, sorted", () => {
    const rows = committedVsReceivedByMonth(
      [card({ stage: "awarded", amountAwarded: 25_000, awardedOn: "2026-07-15" }), card({ stage: "submitted", amountAsked: 9_000 })],
      [
        { pipelineItemId: 1, funderName: "A", funderType: "corporate", amount: 12_500, receivedOn: "2026-07-20", isSample: true },
        { pipelineItemId: 1, funderName: "A", funderType: "corporate", amount: 12_500, receivedOn: "2026-10-15", isSample: true },
      ],
    );
    expect(rows).toEqual([
      { month: "2026-07", committed: 25_000, received: 12_500 },
      { month: "2026-10", committed: 0, received: 12_500 },
    ]);
  });
});
