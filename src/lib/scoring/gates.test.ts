import { describe, expect, test } from "vitest";
import { foundationGates, governmentGates } from "./gates";

describe("foundationGates", () => {
  test("passes when grants were made within 2 years of the latest available filing", () => {
    const gates = foundationGates({ latestGrantYear: 2023, latestAvailableYear: 2024, preselectedOnly: false });
    expect(gates.every((g) => g.passed)).toBe(true);
  });

  test("fails Active when grants are stale", () => {
    const gates = foundationGates({ latestGrantYear: 2019, latestAvailableYear: 2024, preselectedOnly: false });
    const active = gates.find((g) => g.id === "active")!;
    expect(active.passed).toBe(false);
    expect(active.reason).toContain("2019");
  });

  test("fails Active when no grants are on record", () => {
    const gates = foundationGates({ latestGrantYear: null, latestAvailableYear: 2024, preselectedOnly: null });
    expect(gates.find((g) => g.id === "active")!.passed).toBe(false);
  });

  test("fails open-to-asks when preselected organizations only", () => {
    const gates = foundationGates({ latestGrantYear: 2024, latestAvailableYear: 2024, preselectedOnly: true });
    expect(gates.find((g) => g.id === "open_to_asks")!.passed).toBe(false);
  });

  test("unknown preselected flag does not fail the gate", () => {
    const gates = foundationGates({ latestGrantYear: 2024, latestAvailableYear: 2024, preselectedOnly: null });
    expect(gates.find((g) => g.id === "open_to_asks")!.passed).toBe(true);
  });
});

describe("governmentGates", () => {
  const today = new Date("2026-11-13");

  test("passes with a live listing and future deadline", () => {
    expect(governmentGates({ hasListing: true, deadline: "2026-12-31" }, today)[0].passed).toBe(true);
  });

  test("passes with a live listing and no deadline (rolling)", () => {
    expect(governmentGates({ hasListing: true, deadline: null }, today)[0].passed).toBe(true);
  });

  test("fails when the deadline has passed", () => {
    const g = governmentGates({ hasListing: true, deadline: "2026-10-01" }, today)[0];
    expect(g.passed).toBe(false);
    expect(g.reason).toContain("2026-10-01");
  });

  test("fails without a listing", () => {
    expect(governmentGates({ hasListing: false, deadline: null }, today)[0].passed).toBe(false);
  });
});
