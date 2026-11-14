import { describe, expect, test } from "vitest";
import { normalizeEin, normalizeOrgName } from "./normalize";

describe("normalizeOrgName", () => {
  test("matches common spelling variants of the same org", () => {
    expect(normalizeOrgName("Tech-Moms")).toBe(normalizeOrgName("TECH MOMS INC"));
    expect(normalizeOrgName("Women Tech Council, Inc.")).toBe(normalizeOrgName("WOMEN TECH COUNCIL"));
    expect(normalizeOrgName("Boys & Girls Club")).toBe(normalizeOrgName("BOYS AND GIRLS CLUB"));
  });
});

describe("normalizeEin", () => {
  test("strips dashes and left-pads", () => {
    expect(normalizeEin("86-3417178")).toBe("863417178");
    expect(normalizeEin(42702867)).toBe("042702867");
  });
});
