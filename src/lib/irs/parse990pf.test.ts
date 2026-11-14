import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parse990PF } from "./parse990pf";

const xml = readFileSync("scripts/fixtures/990pf-sample.xml", "utf8");

describe("parse990PF (fixture: Faye & Lucille Stewart Foundation, TY2024)", () => {
  const r = parse990PF(xml);

  test("reads the filer, not the preparer firm", () => {
    expect(r.ein).toBe("930800814");
    expect(r.name).toBe("FAYE & LUCILLE STEWART FOUNDATION");
    expect(r.state).toBe("OR");
    expect(r.city).toBe("EUGENE");
  });

  test("reads tax year and money fields", () => {
    expect(r.taxYear).toBe(2024);
    expect(r.totalGiving).toBe(111000);
    expect(r.totalAssets).toBe(5916748);
  });

  test("reads the preselected-organizations-only checkbox", () => {
    expect(r.preselectedOnly).toBe(true);
  });

  test("parses grants paid with recipient state, purpose and amount", () => {
    expect(r.grants).toHaveLength(7);
    const first = r.grants[0];
    expect(first.recipientName).toBe("BOHEMIA FOUNDATION INC");
    expect(first.recipientState).toBe("OR");
    expect(first.amount).toBe(23000);
    expect(first.purpose).toBe("OPERATIONAL EXPENSES");
    expect(r.grants.reduce((s, g) => s + (g.amount ?? 0), 0)).toBe(111000);
  });

  test("keeps officer names and titles but no addresses or phones", () => {
    expect(r.officers.length).toBeGreaterThanOrEqual(2);
    expect(r.officers[0]).toEqual({ name: "ROBERT BRONSON", title: "TREASURER" });
    expect(JSON.stringify(r.officers)).not.toMatch(/PO BOX|\d{10}/);
  });

  test("keeps application info text but never the contact person or phone", () => {
    expect(r.application?.deadlines).toBe("NONE");
    expect(r.application?.restrictions).toBe("UNITED STATES AND TERRITORIES");
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain("5419539646");
    expect(serialized).not.toContain("FAYE LUCILLE STEWART");
  });
});

describe("parse990PF edge cases", () => {
  const wrap = (body: string) => `<?xml version="1.0"?><Return xmlns="http://www.irs.gov/efile"><ReturnHeader>
    <ReturnTypeCd>990PF</ReturnTypeCd><TaxYr>2023</TaxYr>
    <Filer><EIN>123456789</EIN><BusinessName><BusinessNameLine1Txt>ACME FDN</BusinessNameLine1Txt></BusinessName>
    <USAddress><CityNm>SALT LAKE CITY</CityNm><StateAbbreviationCd>UT</StateAbbreviationCd></USAddress></Filer>
    </ReturnHeader><ReturnData><IRS990PF>${body}</IRS990PF></ReturnData></Return>`;

  test("drops names of individual grant recipients (privacy) but keeps the amount", () => {
    const r = parse990PF(
      wrap(`<SupplementaryInformationGrp><GrantOrContributionPdDurYrGrp>
        <RecipientPersonNm>JANE DOE</RecipientPersonNm>
        <RecipientUSAddress><StateAbbreviationCd>UT</StateAbbreviationCd></RecipientUSAddress>
        <GrantOrContributionPurposeTxt>SCHOLARSHIP</GrantOrContributionPurposeTxt><Amt>5000</Amt>
      </GrantOrContributionPdDurYrGrp></SupplementaryInformationGrp>`),
    );
    expect(r.grants).toEqual([
      { recipientName: null, isIndividual: true, recipientCity: null, recipientState: "UT", purpose: "SCHOLARSHIP", amount: 5000 },
    ]);
    expect(JSON.stringify(r)).not.toContain("JANE DOE");
  });

  test("single grant (non-array) and missing preselected flag", () => {
    const r = parse990PF(
      wrap(`<SupplementaryInformationGrp><GrantOrContributionPdDurYrGrp>
        <RecipientBusinessName><BusinessNameLine1Txt>WOMEN TECH COUNCIL</BusinessNameLine1Txt></RecipientBusinessName>
        <RecipientUSAddress><CityNm>LEHI</CityNm><StateAbbreviationCd>UT</StateAbbreviationCd></RecipientUSAddress>
        <Amt>15000</Amt></GrantOrContributionPdDurYrGrp></SupplementaryInformationGrp>`),
    );
    expect(r.grants).toHaveLength(1);
    expect(r.grants[0].recipientName).toBe("WOMEN TECH COUNCIL");
    expect(r.preselectedOnly).toBe(false);
    expect(r.state).toBe("UT");
  });

  test("no supplementary section: preselected is unknown, no grants", () => {
    const r = parse990PF(wrap(""));
    expect(r.preselectedOnly).toBeNull();
    expect(r.grants).toEqual([]);
    expect(r.totalGiving).toBeNull();
  });

  test("throws a clear error for non-990-PF XML", () => {
    expect(() => parse990PF("<html>Security Check</html>")).toThrow(/not a 990-PF/i);
  });
});
