import { describe, expect, it } from "vitest";
import type { PaymentRow, PipelineCard } from "./pipeline-model";
import {
  addDaysIso,
  applicationDeadlines,
  awardedVsReceivedByMonth,
  dollarsByStage,
  fundingByPurpose,
  fundingKpis,
  isDueWithin,
  parseTab,
} from "./reporting-model";

let nextId = 1;
const card = (o: Partial<PipelineCard> & { awardedOn?: string | null }): PipelineCard & { awardedOn?: string | null } => ({
  id: nextId++,
  funderId: 1,
  funderName: "Funder",
  funderType: "corporate",
  opportunityTitle: null,
  stage: "prospect",
  amountAsked: null,
  amountAwarded: null,
  received: 0,
  deadline: null,
  isSample: false,
  ...o,
});
const pay = (pipelineItemId: number, amount: number, receivedOn: string): PaymentRow => ({ pipelineItemId, funderName: "F", funderType: "corporate", amount, receivedOn, isSample: false });

describe("parseTab", () => {
  it("defaults to Funding Health and accepts the three tabs", () => {
    expect(parseTab(undefined)).toBe("funding-health");
    expect(parseTab("nope")).toBe("funding-health");
    expect(parseTab("funder-strategy")).toBe("funder-strategy");
    expect(parseTab(["action-center", "x"])).toBe("action-center");
  });
});

describe("fundingKpis", () => {
  it("sums awarded, cash received on awarded items, and active LOI/Submitted asks", () => {
    const cards = [
      card({ stage: "awarded", amountAwarded: 20_000, received: 5_000 }),
      card({ stage: "awarded", amountAwarded: 10_000, received: 10_000 }),
      card({ stage: "loi", amountAsked: 15_000 }),
      card({ stage: "submitted", amountAsked: 8_000 }),
      card({ stage: "prospect", amountAsked: 99_000 }),
      card({ stage: "declined", amountAsked: 7_000, received: 500 }),
    ];
    expect(fundingKpis(cards)).toEqual({ committed: 30_000, received: 15_000, stillToReceive: 15_000, activeRequests: 23_000 });
  });

  it("never lets Still to Receive go below zero", () => {
    expect(fundingKpis([card({ stage: "awarded", amountAwarded: 1_000, received: 1_500 })]).stillToReceive).toBe(0);
  });

  it("is all zeros with no data", () => {
    expect(fundingKpis([])).toEqual({ committed: 0, received: 0, stillToReceive: 0, activeRequests: 0 });
  });
});

describe("awardedVsReceivedByMonth", () => {
  it("groups by month and ignores payments on items that are not awarded", () => {
    const a = card({ stage: "awarded", amountAwarded: 10_000, awardedOn: "2026-07-10" });
    const p = card({ stage: "submitted", amountAsked: 5_000 });
    const rows = awardedVsReceivedByMonth([a, p], [pay(a.id, 4_000, "2026-08-01"), pay(p.id, 9_999, "2026-08-02")]);
    expect(rows).toEqual([
      { month: "2026-07", awarded: 10_000, received: 0 },
      { month: "2026-08", awarded: 0, received: 4_000 },
    ]);
  });
});

describe("dollarsByStage", () => {
  it("lists all five stages in order, even when empty", () => {
    const rows = dollarsByStage([card({ stage: "awarded", amountAwarded: 12_000 }), card({ stage: "loi", amountAsked: 3_000 })]);
    expect(rows.map((r) => r.label)).toEqual(["Prospect", "LOI", "Submitted", "Awarded", "Declined"]);
    expect(rows.map((r) => r.value)).toEqual([0, 3_000, 0, 12_000, 0]);
    expect(rows[3].count).toBe(1);
  });
});

describe("fundingByPurpose", () => {
  it("computes Still Needed as goal minus awarded, floored at zero", () => {
    const cards = [
      card({ stage: "awarded", amountAwarded: 20_000, received: 5_000, purpose: "scholarships" }),
      card({ stage: "awarded", amountAwarded: 30_000, received: 30_000, purpose: "childcare" }),
      card({ stage: "awarded", amountAwarded: 4_000 }),
      card({ stage: "submitted", amountAsked: 50_000, purpose: "scholarships" }),
    ];
    const { rows, unassignedAwarded } = fundingByPurpose(cards, { scholarships: 50_000, childcare: 25_000 });
    const by = Object.fromEntries(rows.map((r) => [r.purpose, r]));
    expect(by.scholarships).toMatchObject({ goal: 50_000, awarded: 20_000, received: 5_000, stillNeeded: 30_000 });
    expect(by.childcare.stillNeeded).toBe(0);
    expect(by.technology).toMatchObject({ goal: 0, awarded: 0, stillNeeded: 0 });
    expect(rows).toHaveLength(4);
    expect(unassignedAwarded).toBe(1);
  });
});

describe("dates and deadlines", () => {
  it("adds days across month and year ends", () => {
    expect(addDaysIso("2026-12-20", 30)).toBe("2027-01-19");
    expect(addDaysIso("2026-03-01", 0)).toBe("2026-03-01");
  });

  it("treats the window as inclusive and excludes past dates", () => {
    expect(isDueWithin("2026-11-14", "2026-11-14")).toBe(true);
    expect(isDueWithin("2026-12-14", "2026-11-14")).toBe(true);
    expect(isDueWithin("2026-12-15", "2026-11-14")).toBe(false);
    expect(isDueWithin("2026-11-13", "2026-11-14")).toBe(false);
    expect(isDueWithin(null, "2026-11-14")).toBe(false);
  });

  it("lists each deadline once: an open call linked to a pipeline item is not repeated", () => {
    const today = "2026-11-14";
    const linked = card({ stage: "submitted", deadline: "2026-11-20", opportunityId: 7, opportunityTitle: "STEM grant" });
    const done = card({ stage: "awarded", deadline: "2026-11-21" });
    const rows = applicationDeadlines(
      [linked, done],
      [
        { id: 7, funderName: "A", title: "STEM grant", deadline: "2026-11-20" },
        { id: 8, funderName: "B", title: "Open call", deadline: "2026-11-18" },
        { id: 9, funderName: "C", title: "Too far", deadline: "2027-03-01" },
      ],
      today,
    );
    expect(rows.map((r) => [r.key, r.due])).toEqual([
      ["o8", "2026-11-18"],
      [`p${linked.id}`, "2026-11-20"],
    ]);
  });
});
