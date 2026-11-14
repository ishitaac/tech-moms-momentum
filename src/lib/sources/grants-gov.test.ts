import { describe, expect, test } from "vitest";
import { isRelevantHit, toIsoDate } from "./grants-gov";

const hit = (title: string, agencyCode: string) => ({
  id: "1",
  number: "X",
  title,
  agencyCode,
  agency: "A",
  closeDate: "",
  oppStatus: "posted",
});

describe("isRelevantHit", () => {
  test("keeps workforce-agency listings and mission-keyword titles", () => {
    expect(isRelevantHit(hit("Pathways Home", "DOL-ETA"))).toBe(true);
    expect(isRelevantHit(hit("Digital Skills for Rural Workers", "USDA-RD"))).toBe(true);
  });

  test("drops research agencies and research-style titles", () => {
    expect(isRelevantHit(hit("Workforce training", "HHS-NIH11"))).toBe(false);
    expect(isRelevantHit(hit("Mid-scale Research Infrastructure", "NSF"))).toBe(false);
    expect(isRelevantHit(hit("Graduate STEM fellowships", "ED-OPE"))).toBe(false);
  });

  test("drops unrelated titles from non-workforce agencies", () => {
    expect(isRelevantHit(hit("Coastal Resilience", "DOC-NOAA"))).toBe(false);
  });
});

describe("toIsoDate", () => {
  test("converts MM/DD/YYYY", () => {
    expect(toIsoDate("02/08/2027")).toBe("2027-02-08");
    expect(toIsoDate("")).toBeNull();
  });
});
