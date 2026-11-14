import { describe, expect, it } from "vitest";
import {
  ACTION_TEXT,
  actionCenter,
  addDaysIso,
  applicationsDueSoon,
  awardedVsReceivedByMonth,
  collectionTracker,
  daysUntil,
  fundingKpis,
  hasSampleData,
  parseTab,
  pipelineGlance,
  strategyRows,
  unlinkedOpenCalls,
  type ReportItem,
  type ReportOpenCall,
  type ReportPayment,
} from "./reports-model";

const TODAY = "2026-11-14";

let nextId = 1;
const item = (o: Partial<ReportItem> = {}): ReportItem => ({
  id: nextId++,
  funderId: 1,
  funderName: "Funder",
  funderType: "corporate",
  stage: "prospect",
  amountAsked: null,
  amountAwarded: null,
  deadline: null,
  awardedOn: null,
  isSample: false,
  opportunityId: null,
  opportunityTitle: null,
  opportunityDeadline: null,
  route: null,
  received: 0,
  ...o,
});
const awarded = (amount: number | null, received = 0, o: Partial<ReportItem> = {}) => item({ stage: "awarded", amountAwarded: amount, received, awardedOn: "2026-09-10", ...o });
const call = (o: Partial<ReportOpenCall> = {}): ReportOpenCall => ({ id: nextId++, funderName: "Gov", title: "Open call", deadline: null, route: null, awardMin: null, awardMax: null, ...o });

describe("no records", () => {
  it("shows genuine zeros, no data-quality noise, and empty lists", () => {
    expect(fundingKpis([])).toEqual({
      awardedCount: 0,
      committed: 0,
      cashReceived: 0,
      stillToReceive: 0,
      activeRequests: 0,
      quality: { overpaid: [], awardedMissingAmount: 0, awardedMissingDate: 0, activeMissingAsk: 0 },
    });
    expect(awardedVsReceivedByMonth([], [])).toEqual({ rows: [], awardedWithoutDate: 0 });
    expect(collectionTracker([])).toEqual([]);
    expect(pipelineGlance([]).map((s) => [s.count, s.dollars])).toEqual([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]);
    expect(actionCenter([], [], TODAY)).toMatchObject({ rows: [], kpis: { applicationsDueSoon: 0, paymentsPendingCount: 0, paymentsPendingBalance: 0, openCallsNotInPipeline: 0, awardedOutstanding: 0 } });
    expect(strategyRows([]).every((r) => r.items === 0 && r.winRate === null && r.action === ACTION_TEXT.collect)).toBe(true);
    expect(hasSampleData([])).toBe(false);
  });
});

describe("only sample records", () => {
  it("computes normally and reports that sample data is included", () => {
    const items = [awarded(20_000, 5_000, { isSample: true }), item({ stage: "submitted", amountAsked: 8_000, isSample: true })];
    expect(hasSampleData(items)).toBe(true);
    expect(fundingKpis(items)).toMatchObject({ committed: 20_000, cashReceived: 5_000, stillToReceive: 15_000, activeRequests: 8_000 });
    expect(collectionTracker(items)[0].isSample).toBe(true);
    expect(strategyRows(items).find((r) => r.type === "corporate")?.hasSample).toBe(true);
    expect(actionCenter(items, [], TODAY).rows.every((r) => r.isSample)).toBe(true);
  });
});

describe("awarded funding and payments", () => {
  it("awarded with no payment: the whole award is still to receive, next action is a follow-up", () => {
    const items = [awarded(25_000, 0)];
    expect(fundingKpis(items)).toMatchObject({ committed: 25_000, cashReceived: 0, stillToReceive: 25_000 });
    expect(collectionTracker(items)[0]).toMatchObject({ received: 0, stillToReceive: 25_000, percentReceived: 0, nextAction: "Follow up on payment" });
  });

  it("partial payment", () => {
    const items = [awarded(20_000, 5_000)];
    expect(fundingKpis(items)).toMatchObject({ cashReceived: 5_000, stillToReceive: 15_000 });
    expect(collectionTracker(items)[0]).toMatchObject({ stillToReceive: 15_000, percentReceived: 0.25, nextAction: "Follow up on payment" });
  });

  it("fully received: nothing left, no payment follow-up row", () => {
    const items = [awarded(10_000, 10_000)];
    expect(fundingKpis(items).stillToReceive).toBe(0);
    expect(collectionTracker(items)[0]).toMatchObject({ stillToReceive: 0, percentReceived: 1, nextAction: "Fully received", overpaidBy: 0 });
    const { rows, kpis } = actionCenter(items, [], TODAY);
    expect(rows).toEqual([]);
    expect(kpis).toMatchObject({ paymentsPendingCount: 0, paymentsPendingBalance: 0 });
  });

  it("overpaid: not negative, not hidden. It is flagged as a data-quality note, and cannot mask another item's balance", () => {
    const over = awarded(10_000, 12_500, { funderName: "Overpaid Org" });
    const owing = awarded(20_000, 5_000, { funderName: "Owing Org" });
    const k = fundingKpis([over, owing]);
    expect(k.stillToReceive).toBe(15_000); // 0 (not -2,500) + 15,000
    expect(k.cashReceived).toBe(17_500);
    expect(k.quality.overpaid).toEqual([{ funderName: "Overpaid Org", over: 2_500, isSample: false }]);
    const row = collectionTracker([over, owing]).find((r) => r.funderName === "Overpaid Org")!;
    expect(row).toMatchObject({ stillToReceive: 0, overpaidBy: 2_500, nextAction: "Fully received" });
    expect(row.percentReceived).toBe(1.25);
  });

  it("only counts payments on Awarded items", () => {
    const declined = item({ stage: "declined", received: 999 });
    expect(fundingKpis([awarded(1_000, 400), declined]).cashReceived).toBe(400);
  });

  it("says Not recorded (null), not $0, when awarded items have no amount", () => {
    const k = fundingKpis([awarded(null, 0), item({ stage: "loi", amountAsked: null })]);
    expect(k.committed).toBeNull();
    expect(k.stillToReceive).toBeNull();
    expect(k.activeRequests).toBeNull();
    expect(k.quality.awardedMissingAmount).toBe(1);
    expect(k.quality.activeMissingAsk).toBe(1);
    expect(collectionTracker([awarded(null)])[0]).toMatchObject({ awarded: null, stillToReceive: null, percentReceived: null, nextAction: "Record the award amount" });
  });

  it("sums recorded amounts and notes the ones that are missing", () => {
    const k = fundingKpis([awarded(10_000, 0), awarded(null, 0)]);
    expect(k.committed).toBe(10_000);
    expect(k.quality.awardedMissingAmount).toBe(1);
  });

  it("Active Funding Requests counts only LOI and Submitted", () => {
    const k = fundingKpis([
      item({ stage: "prospect", amountAsked: 1_000 }),
      item({ stage: "loi", amountAsked: 2_000 }),
      item({ stage: "submitted", amountAsked: 4_000 }),
      item({ stage: "awarded", amountAsked: 8_000, amountAwarded: 8_000 }),
      item({ stage: "declined", amountAsked: 16_000 }),
    ]);
    expect(k.activeRequests).toBe(6_000);
  });

  it("collection tracker sorts by amount still to receive, largest first", () => {
    const rows = collectionTracker([awarded(5_000, 5_000, { funderName: "C" }), awarded(9_000, 1_000, { funderName: "A" }), awarded(30_000, 5_000, { funderName: "B" })]);
    expect(rows.map((r) => r.funderName)).toEqual(["B", "A", "C"]);
  });
});

describe("Funding Movement chart", () => {
  it("groups awards by award month and cash by payment month, leaving out awards with no date and counting them", () => {
    const a = awarded(10_000, 0, { awardedOn: "2026-07-10" });
    const b = awarded(5_000, 0, { awardedOn: null });
    const declined = item({ stage: "declined" });
    const payments: ReportPayment[] = [
      { pipelineItemId: a.id, amount: 4_000, receivedOn: "2026-08-01" },
      { pipelineItemId: a.id, amount: 1_000, receivedOn: "2026-08-20" },
      { pipelineItemId: declined.id, amount: 9_999, receivedOn: "2026-08-05" },
    ];
    expect(awardedVsReceivedByMonth([a, b, declined], payments)).toEqual({
      rows: [
        { month: "2026-07", awarded: 10_000, received: 0 },
        { month: "2026-08", awarded: 0, received: 5_000 },
      ],
      awardedWithoutDate: 1,
    });
  });
});

describe("Pipeline at a Glance", () => {
  it("uses awarded dollars for Awarded and asked dollars elsewhere, with counts per stage", () => {
    const rows = pipelineGlance([
      item({ stage: "prospect", amountAsked: 1_000 }),
      item({ stage: "prospect", amountAsked: 500 }),
      item({ stage: "awarded", amountAsked: 9_000, amountAwarded: 7_000 }),
      item({ stage: "declined", amountAsked: 3_000 }),
      item({ stage: "loi", amountAsked: null }),
    ]);
    expect(rows.map((r) => [r.label, r.count, r.dollars])).toEqual([
      ["Prospect", 2, 1_500],
      ["LOI", 1, null], // an item exists but no amount is recorded
      ["Submitted", 0, 0],
      ["Awarded", 1, 7_000],
      ["Declined", 1, 3_000],
    ]);
  });
});

describe("dates", () => {
  it("adds and counts days across month ends", () => {
    expect(addDaysIso("2026-12-20", 30)).toBe("2027-01-19");
    expect(daysUntil("2026-11-21", TODAY)).toBe(7);
    expect(daysUntil("2026-11-13", TODAY)).toBe(-1);
  });
});

describe("application deadlines", () => {
  it("opportunity deadline within 7 days: shows in the this-week group with a calendar key", () => {
    const c = call({ deadline: "2026-11-18", title: "STEM call", route: "loi", awardMin: 5_000, awardMax: 25_000 });
    const { rows, kpis } = actionCenter([], [c], TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "open-call",
      group: "this-week",
      due: "2026-11-18",
      action: "Application deadline",
      status: "Open Call",
      route: "LOI first",
      amountText: "$5,000–$25,000",
      calendarKey: `o${c.id}`,
      overdueTag: null,
      nextAction: "Review eligibility and add to pipeline if relevant.",
    });
    expect(kpis.applicationsDueSoon).toBe(1);
    expect(kpis.openCallsNotInPipeline).toBe(1);
  });

  it("opportunity deadline within 30 days (8-30): next-30 group", () => {
    const c = call({ deadline: "2026-12-10" });
    const { rows, kpis } = actionCenter([], [c], TODAY);
    expect(rows[0].group).toBe("next-30");
    expect(kpis.applicationsDueSoon).toBe(1);
  });

  it("a deadline beyond 30 days is listed after the 8-30 group but is not 'due soon'", () => {
    const c = call({ deadline: "2027-02-01" });
    const { rows, kpis } = actionCenter([], [c], TODAY);
    expect(rows[0].group).toBe("later");
    expect(kpis.applicationsDueSoon).toBe(0);
    expect(rows[0].calendarKey).toBeNull(); // outside the calendar route's 60-day window
  });

  it("does not double count: a pipeline item linked to an opportunity uses its own deadline first, and the call is not repeated", () => {
    const linked = item({ stage: "loi", deadline: "2026-11-20", opportunityId: 7, opportunityDeadline: "2026-11-25", opportunityTitle: "Linked call", amountAsked: 10_000 });
    const items = [linked];
    const calls = [call({ id: 7, deadline: "2026-11-25", title: "Linked call" }), call({ id: 8, deadline: "2026-11-19" })];
    expect(unlinkedOpenCalls(items, calls).map((c) => c.id)).toEqual([8]);
    const { rows, kpis } = actionCenter(items, calls, TODAY);
    expect(rows.map((r) => [r.calendarKey, r.due])).toEqual([
      ["o8", "2026-11-19"],
      [`p${linked.id}`, "2026-11-20"], // the pipeline item's deadline, not the call's 11-25
    ]);
    expect(kpis.applicationsDueSoon).toBe(2);
    expect(applicationsDueSoon(items, calls, TODAY)).toBe(2);
  });

  it("falls back to the linked opportunity's deadline only when the pipeline item has none", () => {
    const linked = item({ stage: "prospect", deadline: null, opportunityId: 3, opportunityDeadline: "2026-11-22" });
    expect(actionCenter([linked], [], TODAY).rows[0].due).toBe("2026-11-22");
  });

  it("a pipeline item deadline within 7 days and one within 30 days are sorted into their groups", () => {
    const soon = item({ stage: "loi", deadline: "2026-11-16", funderName: "Soon", amountAsked: 5_000 });
    const mid = item({ stage: "submitted", deadline: "2026-12-12", funderName: "Mid" });
    const { rows } = actionCenter([mid, soon], [], TODAY);
    expect(rows.map((r) => [r.funderName, r.group])).toEqual([
      ["Soon", "this-week"],
      ["Mid", "next-30"],
    ]);
    expect(rows[1].amountText).toBe("Not recorded"); // no amount_asked on the item
  });

  it("ignores deadlines on Awarded and Declined items", () => {
    expect(actionCenter([awarded(1_000, 1_000, { deadline: "2026-11-20" }), item({ stage: "declined", deadline: "2026-11-20" })], [], TODAY).rows).toEqual([]);
  });

  it("past-due items come first with an Overdue tag; a Submitted item past its deadline is not overdue", () => {
    const late = item({ stage: "loi", deadline: "2026-11-10", funderName: "Late" });
    const submittedPast = item({ stage: "submitted", deadline: "2026-11-01", funderName: "Done" });
    const upcoming = item({ stage: "loi", deadline: "2026-11-15", funderName: "Upcoming" });
    const { rows, kpis } = actionCenter([upcoming, submittedPast, late], [], TODAY);
    expect(rows.map((r) => [r.funderName, r.group, r.overdueTag])).toEqual([
      ["Late", "overdue", "Overdue"],
      ["Upcoming", "this-week", null],
    ]);
    expect(rows[0].calendarKey).toBeNull(); // the calendar route skips past dates
    expect(kpis.applicationsDueSoon).toBe(1);
  });

  it("an open call with no deadline is listed after dated rows and before payments", () => {
    const items = [awarded(10_000, 2_000, { funderName: "Payer" })];
    const { rows } = actionCenter(items, [call({ deadline: null, title: "Rolling call" }), call({ deadline: "2026-11-30" })], TODAY);
    expect(rows.map((r) => r.group)).toEqual(["next-30", "no-deadline", "payments"]);
    expect(rows[1]).toMatchObject({ due: null, action: "Review open opportunity", calendarKey: null, amountText: "Not stated" });
  });

  it("open call award ranges read naturally", () => {
    const text = (min: number | null, max: number | null) => actionCenter([], [call({ awardMin: min, awardMax: max })], TODAY).rows[0].amountText;
    expect(text(5_000, 5_000)).toBe("$5,000");
    expect(text(null, 30_000)).toBe("Up to $30,000");
    expect(text(5_000, null)).toBe("From $5,000");
  });

  it("only offers a calendar link inside the route's 60-day window", () => {
    const a = call({ deadline: "2027-01-12" }); // 59 days
    const b = call({ deadline: "2027-01-14" }); // 61 days
    const { rows } = actionCenter([], [a, b], TODAY);
    expect(rows.map((r) => r.calendarKey)).toEqual([`o${a.id}`, null]);
  });
});

describe("payment follow-ups", () => {
  it("one row per awarded item with a balance, dated 'Not scheduled' (null), no calendar key, largest balance first", () => {
    const small = awarded(10_000, 9_000, { funderName: "Small" });
    const big = awarded(30_000, 5_000, { funderName: "Big" });
    const paid = awarded(8_000, 8_000, { funderName: "Paid" });
    const { rows, kpis } = actionCenter([small, big, paid], [], TODAY);
    expect(rows.map((r) => r.funderName)).toEqual(["Big", "Small"]);
    expect(rows[0]).toMatchObject({ kind: "payment", due: null, calendarKey: null, action: "Payment follow-up", status: "Payment pending", amountText: "$25,000", route: "Not applicable", nextAction: "Confirm payment timing with funder." });
    expect(kpis).toMatchObject({ paymentsPendingCount: 2, paymentsPendingBalance: 26_000, awardedOutstanding: 26_000 });
  });

  it("awarded items with no amount are not counted as pending, and the gap is reported", () => {
    const { kpis } = actionCenter([awarded(null, 0)], [], TODAY);
    expect(kpis).toMatchObject({ paymentsPendingCount: 0, awardedOutstanding: null, awardedMissingAmount: 1 });
  });
});

describe("Funder Strategy", () => {
  const decided = (type: string, wins: number, losses: number, o: Partial<ReportItem> = {}) => [
    ...Array.from({ length: wins }, () => item({ funderType: type, stage: "awarded", amountAwarded: 10_000, received: 4_000, ...o })),
    ...Array.from({ length: losses }, () => item({ funderType: type, stage: "declined", amountAsked: 10_000, ...o })),
  ];

  it("a type with fewer than five decided opportunities shows 'Not enough data' (null win rate), not a percentage", () => {
    const row = strategyRows(decided("state", 2, 2)).find((r) => r.type === "state")!;
    expect(row).toMatchObject({ decided: 4, awards: 2, enoughData: false, winRate: null });
  });

  it("with five or more decided, win rate = awards / decided", () => {
    const row = strategyRows(decided("state", 3, 3)).find((r) => r.type === "state")!;
    expect(row).toMatchObject({ decided: 6, winRate: 0.5, enoughData: true });
  });

  it("computes the table columns from current stages and payments", () => {
    const items = [
      ...decided("foundation", 1, 1),
      item({ funderType: "foundation", stage: "submitted", amountAsked: 5_000 }),
      item({ funderType: "foundation", stage: "loi", amountAsked: 5_000 }),
      item({ funderType: "foundation", stage: "prospect" }),
      item({ funderType: "foundation", stage: "awarded", amountAwarded: 20_000, received: 6_000 }),
    ];
    const row = strategyRows(items).find((r) => r.type === "foundation")!;
    expect(row).toMatchObject({
      items: 6,
      submitted: 4, // submitted + awarded (2) + declined; prospect and loi excluded
      awards: 2,
      decided: 3,
      amountReceived: 10_000, // 4,000 + 6,000
      averageAward: 15_000, // (10,000 + 20,000) / 2
      activeRequests: 2,
    });
  });

  it("average award is null with no awards, and null (not recorded) when awards have no amount", () => {
    expect(strategyRows([item({ funderType: "federal", stage: "declined" })]).find((r) => r.type === "federal")!.averageAward).toBeNull();
    const noAmount = strategyRows([item({ funderType: "corporate", stage: "awarded", amountAwarded: null })]).find((r) => r.type === "corporate")!;
    expect(noAmount).toMatchObject({ awards: 1, averageAward: null });
  });

  it("always lists the five stored funder types in a fixed order", () => {
    expect(strategyRows([]).map((r) => r.label)).toEqual(["State", "Federal", "Corporate", "Foundation", "Family Foundation"]);
  });

  describe("recommended actions (rules, not AI)", () => {
    const action = (items: ReportItem[], type: string) => strategyRows(items).find((r) => r.type === type)!.action;

    it("State: prioritize at a 40%+ win rate with enough data", () => {
      expect(action(decided("state", 2, 3), "state")).toBe(ACTION_TEXT.state);
    });
    it("State: prioritize when it is the top source of received dollars, even with little data", () => {
      expect(action([...decided("state", 1, 0), ...decided("corporate", 0, 0)], "state")).toBe(ACTION_TEXT.state);
    });
    it("State: a low win rate that is not the top earner gets no recommendation from the rules", () => {
      const items = [...decided("state", 1, 5, { received: 0 }), ...decided("foundation", 1, 0, { received: 50_000 })];
      expect(action(items, "state")).toBe(ACTION_TEXT.none);
    });
    it("Foundation and Family Foundation: grow relationships with an award or 3+ active requests", () => {
      expect(action(decided("foundation", 1, 0), "foundation")).toBe(ACTION_TEXT.foundation);
      const active = ["loi", "submitted", "loi"].map((stage) => item({ funderType: "family_foundation", stage: stage as ReportItem["stage"], amountAsked: 1_000 }));
      expect(action(active, "family_foundation")).toBe(ACTION_TEXT.foundation);
      expect(action([item({ funderType: "family_foundation", stage: "loi" })], "family_foundation")).toBe(ACTION_TEXT.collect);
    });
    it("Corporate: pursue with an award, a payment, or a $10,000+ item still in play", () => {
      expect(action(decided("corporate", 1, 0), "corporate")).toBe(ACTION_TEXT.corporate);
      expect(action([item({ funderType: "corporate", stage: "prospect", amountAsked: 12_000 })], "corporate")).toBe(ACTION_TEXT.corporate);
      expect(action([item({ funderType: "corporate", stage: "prospect", amountAsked: 2_000 })], "corporate")).toBe(ACTION_TEXT.collect);
      expect(action([item({ funderType: "corporate", stage: "declined", amountAsked: 50_000 })], "corporate")).toBe(ACTION_TEXT.collect);
    });
    it("Federal: apply selectively with a low win rate or limited history; nothing recorded means collect data", () => {
      expect(action(decided("federal", 1, 9), "federal")).toBe(ACTION_TEXT.federal);
      expect(action(decided("federal", 0, 2), "federal")).toBe(ACTION_TEXT.federal);
      expect(action(decided("federal", 4, 6), "federal")).toBe(ACTION_TEXT.none);
      expect(action([], "federal")).toBe(ACTION_TEXT.collect);
    });
  });
});

describe("parseTab", () => {
  it("defaults to Funding Health and accepts the three tabs", () => {
    expect(parseTab(undefined)).toBe("funding-health");
    expect(parseTab("nope")).toBe("funding-health");
    expect(parseTab("funder-strategy")).toBe("funder-strategy");
    expect(parseTab(["action-center", "x"])).toBe("action-center");
  });
});
