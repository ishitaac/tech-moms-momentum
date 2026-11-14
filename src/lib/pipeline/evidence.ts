/**
 * Turns stored facts into fit-score inputs with human-readable evidence.
 * Pure functions: no DB, no AI. Every evidence string cites real numbers or names.
 */
import {
  GEOGRAPHY,
  MISSION_GRANT_SHARE_FULL,
  MISSION_KEYWORDS,
  MISSION_KEYWORD_SATURATION,
  WOMEN_GRANT_SHARE_FULL,
  WOMEN_KEYWORDS,
} from "@/config/scoring";
import {
  accessScore,
  combineMission,
  geographyScore,
  govGeographyScore,
  grantShareScore,
  historyScore,
  keywordScore,
  missionScore,
  womenScore,
} from "@/lib/scoring/components";
import { foundationGates, governmentGates } from "@/lib/scoring/gates";
import type { ComponentResult, FitInput } from "@/lib/scoring/types";
import { normalizeOrgName } from "@/lib/irs/normalize";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const MAX_KEYWORDS_SHOWN = 3;

function comp(score: number | null, evidence: string | null, sourceUrl: string | null): ComponentResult {
  return score === null ? { score: null, evidence: null, sourceUrl: null } : { score, evidence, sourceUrl };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface OpenCallFact {
  deadline: string | null;
  route: "loi" | "direct" | "unknown";
  sourceUrl: string;
}

export interface FoundationFacts {
  funder: {
    ein: string | null;
    name: string;
    type: string;
    state: string | null;
    acceptsUnsolicited: boolean | null;
    latestFilingYear: number | null;
  };
  filing: { taxYear: number; totalGiving: number | null; sourceUrl: string } | null;
  grants: { recipientName: string; recipientState: string | null; amount: number | null; purpose: string | null }[];
  peerNames: Set<string>;
  latestAvailableYear: number;
  missionAiRating: number | null;
  /** Extracted text from the funder's website, if read. */
  websiteText: string | null;
  openCall: OpenCallFact | null;
}

function accessComponent(
  openCall: OpenCallFact | null,
  acceptsUnsolicited: boolean | null,
  warmIntro: boolean | null,
  fallbackUrl: string | null,
  isPastFunder = false,
): ComponentResult {
  const r = accessScore({
    openCall: openCall ? true : null,
    acceptsUnsolicited,
    route: openCall?.route ?? "unknown",
    warmIntro,
  });
  const notes: string[] = [];
  if (openCall) {
    const route = openCall.route === "unknown" ? "" : ` (${openCall.route.toUpperCase()})`;
    notes.push(`Open call${route}${openCall.deadline ? ` due ${openCall.deadline}` : ""}`);
  }
  if (acceptsUnsolicited) notes.push("Accepts unsolicited requests");
  if (isPastFunder) notes.push("Past funder — existing relationship");
  else if (warmIntro) notes.push("family foundation (warm-intro path)");
  return comp(r.score, notes.join("; ") || "No open call or unsolicited route found", openCall?.sourceUrl ?? fallbackUrl);
}

const quoteList = (hits: string[]) => hits.slice(0, MAX_KEYWORDS_SHOWN).map((h) => `"${h}"`).join(", ");
const SELF = normalizeOrgName("Tech-Moms");

export function foundationFitInput(f: FoundationFacts): FitInput {
  const src = f.filing?.sourceUrl ?? null;
  const ty = f.filing ? ` (TY${f.filing.taxYear})` : "";
  const isPastFunder = f.grants.some((g) => normalizeOrgName(g.recipientName) === SELF);

  // Mission: share of past grants that match (not raw hits), or website keywords; mixed with the AI read.
  const share = grantShareScore(f.grants, MISSION_KEYWORDS, MISSION_GRANT_SHARE_FULL);
  const site = keywordScore(f.websiteText, MISSION_KEYWORDS, MISSION_KEYWORD_SATURATION);
  const keywordPart = share.score === null ? site.score : site.score === null ? share.score : Math.max(share.score, site.score);
  const missionValue = combineMission(keywordPart, f.missionAiRating);
  const missionEvidence = share.matched
    ? `${pct(share.share)} of past grants mention ${quoteList(share.hits)}`
    : site.hits.length
      ? `Website mentions ${quoteList(site.hits)}`
      : f.missionAiRating !== null
        ? `Stated purpose rated ${f.missionAiRating}/3 for mission fit`
        : "No mission keywords in past grants";

  // Women & girls: share of grants to women/girls programs.
  const w = grantShareScore(f.grants, WOMEN_KEYWORDS, WOMEN_GRANT_SHARE_FULL);
  const womenEvidence = w.example
    ? `Funded women-focused grantees, e.g. ${w.example}`
    : w.matched
      ? `${pct(w.share)} of grants mention ${quoteList(w.hits)}`
      : "No women/girls focus found in grants";

  // Geography
  const g = geographyScore(
    f.grants.map((x) => ({ state: x.recipientState, amount: x.amount })),
    f.funder.state,
  );
  const geoEvidence =
    g.utahShare !== null
      ? g.utahShare > 0
        ? `${pct(g.utahShare)} of grant dollars went to Utah${ty}`
        : `${pct(g.regionShare ?? 0)} of grant dollars to the Mountain West, none to Utah${ty}`
      : f.funder.state === GEOGRAPHY.homeState
        ? "Utah-based funder"
        : null;

  // Giving history
  const amounts = f.grants.map((x) => x.amount ?? 0).filter((a) => a > 0);
  const peerHits = f.grants.filter((x) => f.peerNames.has(normalizeOrgName(x.recipientName)));
  const h = historyScore({ grantAmounts: amounts, totalGiving: f.filing?.totalGiving ?? null, peerGrantCount: peerHits.length });
  const historyNotes: string[] = [];
  if (isPastFunder) historyNotes.push("Has funded Tech-Moms before");
  if (amounts.length) historyNotes.push(`Typical grant ${usd(median(amounts))}`);
  if (f.filing?.totalGiving) historyNotes.push(`gave ${usd(f.filing.totalGiving)} in TY${f.filing.taxYear}`);
  if (peerHits.length) historyNotes.push(`funded peer ${[...new Set(peerHits.map((p) => p.recipientName))].slice(0, 2).join(", ")}`);

  const warmIntro = isPastFunder || f.funder.type === "family_foundation" ? true : null;
  const access = accessComponent(f.openCall, f.funder.acceptsUnsolicited, warmIntro, src, isPastFunder);

  return {
    components: {
      mission: comp(missionValue, missionEvidence, f.openCall?.sourceUrl ?? src),
      women: comp(w.score, womenEvidence, src),
      geography: comp(g.score, geoEvidence, src),
      history: comp(h.score, historyNotes.join("; ") || null, src),
      access,
    },
    // A past Tech-Moms funder is proven to fund us: never gate it out (even if "preselected only").
    // No 990 on record (e.g. a corporate giving program): gates can't be judged, so don't exclude;
    // the score relies on website evidence and confidence stays low.
    gates: f.filing && !isPastFunder
      ? foundationGates({
          latestGrantYear: f.grants.length ? f.filing.taxYear : null,
          latestAvailableYear: f.latestAvailableYear,
          preselectedOnly: f.funder.acceptsUnsolicited === null ? null : !f.funder.acceptsUnsolicited,
        })
      : [],
  };
}

export interface GovListing {
  title: string;
  description: string | null;
  eligibility: string | null;
  geography: string | null;
  awardMin: number | null;
  awardMax: number | null;
  deadline: string | null;
  route: "loi" | "direct" | "unknown";
  sourceUrl: string;
  missionAiRating?: number | null;
}

export function governmentFitInput(l: GovListing, today: Date = new Date()): FitInput {
  const text = [l.title, l.description, l.eligibility].filter(Boolean).join(" \n ");
  const m = missionScore(text, l.missionAiRating ?? null);
  const w = womenScore(text, []);
  const geo = govGeographyScore(l.geography ?? l.eligibility);
  const h = historyScore({ grantAmounts: [], totalGiving: null, peerGrantCount: 0, awardRange: { min: l.awardMin, max: l.awardMax } });
  const range =
    l.awardMin !== null || l.awardMax !== null
      ? `Awards ${[l.awardMin, l.awardMax].filter((x): x is number => x !== null).map(usd).join("–")}`
      : null;

  return {
    components: {
      mission: comp(m.score, m.hits.length ? `Listing mentions ${m.hits.slice(0, MAX_KEYWORDS_SHOWN).map((x) => `"${x}"`).join(", ")}` : "Listing has no mission keywords", l.sourceUrl),
      women: comp(w.hits.length ? w.score : null, w.hits.length ? `Listing targets ${w.hits.slice(0, 2).join(", ")}` : null, l.sourceUrl),
      geography: comp(geo, l.geography ? `Eligible area: ${l.geography}` : null, l.sourceUrl),
      history: comp(h.score, range, l.sourceUrl),
      access: accessComponent({ deadline: l.deadline, route: l.route, sourceUrl: l.sourceUrl }, null, null, l.sourceUrl),
    },
    gates: governmentGates({ hasListing: true, deadline: l.deadline }, today),
  };
}
