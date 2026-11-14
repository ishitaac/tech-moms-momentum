import { XMLParser } from "fast-xml-parser";

/**
 * Parses an IRS e-filed 990-PF return (XML) into the fields we score on.
 *
 * Privacy: names of individual grant recipients, application contact people,
 * phone numbers and addresses are deliberately NOT returned. Officer names and
 * titles are kept because they are published on the public filing (US-9).
 */

export interface ParsedGrant {
  recipientName: string | null;
  isIndividual: boolean;
  recipientCity: string | null;
  recipientState: string | null;
  purpose: string | null;
  amount: number | null;
}

export interface Parsed990PF {
  ein: string;
  name: string;
  city: string | null;
  state: string | null;
  taxYear: number;
  website: string | null;
  totalAssets: number | null;
  totalGiving: number | null;
  /** true = "contributes only to preselected organizations"; null = section missing. */
  preselectedOnly: boolean | null;
  application: { materials: string | null; deadlines: string | null; restrictions: string | null } | null;
  grants: ParsedGrant[];
  officers: { name: string; title: string | null }[];
}

const ARRAY_TAGS = new Set([
  "GrantOrContributionPdDurYrGrp",
  "OfficerDirTrstKeyEmplGrp",
  "ApplicationSubmissionInfoGrp",
]);

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

const str = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

const num = (v: unknown): number | null => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const businessName = (n: Node): string | null =>
  n ? [str(n.BusinessNameLine1Txt), str(n.BusinessNameLine2Txt)].filter(Boolean).join(" ") || null : null;

const NOT_A_WEBSITE = /^(n\/?a|none)$/i;

function parseGrant(g: Node): ParsedGrant {
  const isIndividual = g.RecipientPersonNm !== undefined && g.RecipientBusinessName === undefined;
  const addr = g.RecipientUSAddress ?? {};
  return {
    recipientName: isIndividual ? null : businessName(g.RecipientBusinessName),
    isIndividual,
    recipientCity: str(addr.CityNm),
    recipientState: str(addr.StateAbbreviationCd),
    purpose: str(g.GrantOrContributionPurposeTxt),
    amount: num(g.Amt),
  };
}

export function parse990PF(xml: string): Parsed990PF {
  const doc: Node = parser.parse(xml);
  const header = doc?.Return?.ReturnHeader;
  const pf = doc?.Return?.ReturnData?.IRS990PF;
  if (!header || pf === undefined || str(header.ReturnTypeCd) !== "990PF") {
    throw new Error("Document is not a 990-PF return");
  }

  const filer = header.Filer ?? {};
  const pfNode: Node = pf || {};
  const supp: Node | undefined = pfNode.SupplementaryInformationGrp;
  const app: Node | undefined = supp?.ApplicationSubmissionInfoGrp?.[0];
  const officersSrc: Node[] = pfNode.OfficerDirTrstKeyEmplInfoGrp?.OfficerDirTrstKeyEmplGrp ?? [];
  const website = str(pfNode.StatementsRegardingActyGrp?.WebsiteAddressTxt);

  return {
    ein: str(filer.EIN) ?? "",
    name: businessName(filer.BusinessName) ?? "",
    city: str(filer.USAddress?.CityNm),
    state: str(filer.USAddress?.StateAbbreviationCd),
    taxYear: num(header.TaxYr) ?? 0,
    website: website && !NOT_A_WEBSITE.test(website) ? website : null,
    totalAssets: num(pfNode.FMVAssetsEOYAmt),
    totalGiving: num(supp?.TotalGrantOrContriPdDurYrAmt),
    preselectedOnly: supp === undefined ? null : str(supp.OnlyContriToPreselectedInd) !== null,
    application: app
      ? {
          materials: str(app.FormAndInfoAndMaterialsTxt),
          deadlines: str(app.SubmissionDeadlinesTxt),
          restrictions: str(app.RestrictionsOnAwardsTxt),
        }
      : null,
    grants: (supp?.GrantOrContributionPdDurYrGrp ?? []).map(parseGrant),
    officers: officersSrc
      .map((o) => ({ name: str(o.PersonNm) ?? businessName(o.BusinessName) ?? "", title: str(o.TitleTxt) }))
      .filter((o) => o.name),
  };
}
