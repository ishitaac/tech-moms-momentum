/**
 * Grants.gov federal opportunities (search2 + fetchOpportunity, no API key).
 * Cheap filter before details: nonprofit-eligible, not a research agency, and either a
 * mission keyword in the title or a workforce-relevant agency.
 */
import { MISSION_KEYWORDS } from "@/config/scoring";
import { keywordScore } from "@/lib/scoring/components";
import type { Opportunity, SourceAdapter, SourceError, SourceResult } from "./types";

const API = "https://api.grants.gov/v1/api";
const QUERIES = [
  "workforce training women",
  "workforce development nonprofit",
  "digital skills training",
  "career pathways technology",
  "women returning to work",
  "job training technology",
  "STEM workforce women",
  "economic mobility training",
];
/** 12 = 501(c)(3) nonprofits; 25 = others. */
const ELIGIBILITIES = "12|25";
const ROWS_PER_QUERY = 50;
const MAX_DETAILS = 60;
const RELEVANT_AGENCY = /^(DOL|ED|HHS-ACF|SBA|DOC-EDA|AC)/;
const EXCLUDED_TITLE =
  /\b(research|dissertation|doctoral|postdoctoral|graduate|fellowships?|infrastructure|quantum|disaster|public works|head start|k-12)\b/i;
const EXCLUDED_AGENCY = /^(HHS-NIH|DOD|DOE|NASA|DOI|EPA)/;
const TIMEOUT_MS = 20_000;

interface Hit {
  id: string;
  number: string;
  title: string;
  agencyCode: string;
  agency: string;
  closeDate: string;
  oppStatus: string;
}

const decode = (s: string) =>
  s.replace(/&rsquo;|&lsquo;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const stripHtml = (s: string | null | undefined) =>
  s ? decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : null;

/** MM/DD/YYYY → YYYY-MM-DD */
export function toIsoDate(mdy: string | null | undefined): string | null {
  const m = mdy?.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

const num = (s: unknown) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Grants.gov ${path}: HTTP ${res.status}`);
  const json = (await res.json()) as { errorcode: number; msg: string; data: T };
  if (json.errorcode !== 0) throw new Error(`Grants.gov ${path}: ${json.msg}`);
  return json.data;
}

export function isRelevantHit(hit: Hit): boolean {
  if (EXCLUDED_AGENCY.test(hit.agencyCode) || EXCLUDED_TITLE.test(hit.title)) return false;
  const titleHits = keywordScore(decode(hit.title), MISSION_KEYWORDS, 1).hits.length;
  return titleHits > 0 || RELEVANT_AGENCY.test(hit.agencyCode);
}

async function details(hit: Hit): Promise<Opportunity> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = await post<any>("fetchOpportunity", { opportunityId: Number(hit.id) });
  const s = d.synopsis ?? d.forecast ?? {};
  return {
    externalId: `grants.gov:${hit.id}`,
    funderName: decode(hit.agency),
    funderType: "federal",
    title: decode(hit.title),
    description: stripHtml(s.synopsisDesc ?? s.forecastDesc)?.slice(0, 4000) ?? null,
    eligibility: stripHtml(s.applicantEligibilityDesc),
    geography: "Nationwide (federal)",
    awardMin: num(s.awardFloor),
    awardMax: num(s.awardCeiling),
    deadline: toIsoDate(hit.closeDate),
    isOpen: hit.oppStatus === "posted" ? "open" : "unknown",
    route: "direct",
    sourceUrl: `https://www.grants.gov/search-results-detail/${hit.id}`,
    website: null,
  };
}

export const grantsGovAdapter: SourceAdapter = {
  id: "grants-gov",
  label: "Grants.gov (federal)",
  async fetch(): Promise<SourceResult> {
    const errors: SourceError[] = [];
    const hits = new Map<string, Hit>();

    for (const keyword of QUERIES) {
      try {
        const data = await post<{ oppHits: Hit[] }>("search2", {
          keyword,
          oppStatuses: "forecasted|posted",
          eligibilities: ELIGIBILITIES,
          rows: ROWS_PER_QUERY,
        });
        for (const h of data.oppHits) if (isRelevantHit(h)) hits.set(h.id, h);
      } catch (err) {
        errors.push({ source: "grants-gov", message: `search "${keyword}": ${String(err)}` });
      }
    }

    const items: Opportunity[] = [];
    for (const hit of [...hits.values()].slice(0, MAX_DETAILS)) {
      try {
        items.push(await details(hit));
      } catch (err) {
        errors.push({ source: "grants-gov", message: String(err), url: `https://www.grants.gov/search-results-detail/${hit.id}` });
      }
    }
    return { items, errors, fetchedAt: new Date() };
  },
};
