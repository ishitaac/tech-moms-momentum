import {
  ACCESS_POINTS,
  GEOGRAPHY,
  GIVING,
  MISSION_KEYWORDS,
  MISSION_KEYWORD_SATURATION,
  MISSION_MIX,
  WOMEN_KEYWORDS,
  WOMEN_FALSE_POSITIVES,
  WOMEN_KEYWORD_SATURATION,
} from "@/config/scoring";

const AI_SCALE_MAX = 3;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function keywordScore(
  text: string | null | undefined,
  keywords: readonly string[],
  saturation: number,
): { score: number | null; hits: string[] } {
  if (!text || !text.trim()) return { score: null, hits: [] };
  const hits = keywords.filter((kw) => new RegExp(`\\b${escapeRegex(kw)}\\b`, "i").test(text));
  return { score: Math.min(1, hits.length / saturation), hits };
}

/** Mission = keyword share + AI anchored read (0-3). Uses whichever is available. */
export function missionScore(text: string | null, aiRating: number | null) {
  const kw = keywordScore(text, MISSION_KEYWORDS, MISSION_KEYWORD_SATURATION);
  return { score: combineMission(kw.score, aiRating), hits: kw.hits, aiRating };
}

/** Mixes a keyword score (0-1) with the AI anchored read (0-3); uses whichever exists. */
export function combineMission(keyword: number | null, aiRating: number | null): number | null {
  const ai = aiRating === null ? null : Math.min(1, Math.max(0, aiRating / AI_SCALE_MAX));
  if (keyword !== null && ai !== null) return MISSION_MIX.keyword * keyword + MISSION_MIX.ai * ai;
  return keyword ?? ai;
}

const stripFalsePositives = (keywords: readonly string[], text: string) =>
  keywords === WOMEN_KEYWORDS ? text.replace(WOMEN_FALSE_POSITIVES, " ") : text;

export function womenScore(purpose: string | null, granteeNames: string[]) {
  const text = stripFalsePositives(WOMEN_KEYWORDS, [purpose ?? "", ...granteeNames].join(" \n "));
  return keywordScore(text, WOMEN_KEYWORDS, WOMEN_KEYWORD_SATURATION);
}

/**
 * Share of past grants whose recipient name or purpose matches any keyword.
 * `fullShare` = share that earns full credit.
 */
export function grantShareScore(
  grants: { recipientName: string; purpose: string | null }[],
  keywords: readonly string[],
  fullShare: number,
): { score: number | null; share: number; matched: number; hits: string[]; example: string | null } {
  if (grants.length === 0) return { score: null, share: 0, matched: 0, hits: [], example: null };
  const hitSet = new Set<string>();
  let matched = 0;
  let example: string | null = null;
  for (const g of grants) {
    const text = stripFalsePositives(keywords, `${g.recipientName} \n ${g.purpose ?? ""}`);
    const { hits } = keywordScore(text, keywords, 1);
    if (hits.length === 0) continue;
    matched++;
    hits.forEach((h) => hitSet.add(h));
    if (!example && keywordScore(stripFalsePositives(keywords, g.recipientName), keywords, 1).hits.length) {
      example = g.recipientName;
    }
  }
  const share = matched / grants.length;
  return { score: Math.min(1, share / fullShare), share, matched, hits: [...hitSet], example };
}

export interface GeoGrant {
  state: string | null;
  amount: number | null;
}

export function geographyScore(grants: GeoGrant[], funderState?: string | null) {
  const valid = grants.filter((g) => g.amount && g.amount > 0 && g.state);
  const total = valid.reduce((s, g) => s + g.amount!, 0);
  if (total === 0) {
    // No grant geography on record: a Utah-based funder still counts as Utah-focused.
    if (funderState === GEOGRAPHY.homeState) return { score: 1, utahShare: null, regionShare: null };
    return { score: null, utahShare: null, regionShare: null };
  }
  const sum = (pred: (s: string) => boolean) =>
    valid.filter((g) => pred(g.state!.toUpperCase())).reduce((s, g) => s + g.amount!, 0);
  const utahShare = sum((s) => s === GEOGRAPHY.homeState) / total;
  const regionShare = sum((s) => (GEOGRAPHY.region as readonly string[]).includes(s)) / total;
  const effective = utahShare / GEOGRAPHY.homeShareForFullCredit + regionShare * GEOGRAPHY.regionCredit;
  return {
    score: Math.min(1, effective),
    utahShare,
    regionShare,
  };
}

const NATIONAL_CREDIT = 0.6;
const OTHER_REGION_CREDIT = 0.2;

/** Government listings: score the eligible geography text. */
export function govGeographyScore(eligibleGeography: string | null): number | null {
  if (!eligibleGeography) return null;
  const t = eligibleGeography.toLowerCase();
  if (/\butah\b|\but\b/.test(t)) return 1;
  if (/nation|united states|all states|\bus\b|\bu\.s\./.test(t)) return NATIONAL_CREDIT;
  return OTHER_REGION_CREDIT;
}

const NEAR_SWEET_SPOT_FACTOR = 2;
const NEAR_SWEET_SPOT_CREDIT = 0.5;

function grantSizeCredit(amount: number): number {
  if (amount >= GIVING.sweetSpotMin && amount <= GIVING.sweetSpotMax) return 1;
  const near =
    amount >= GIVING.sweetSpotMin / NEAR_SWEET_SPOT_FACTOR &&
    amount <= GIVING.sweetSpotMax * NEAR_SWEET_SPOT_FACTOR;
  return near ? NEAR_SWEET_SPOT_CREDIT : 0;
}

function rangeOverlap(min: number, max: number): number {
  const lo = Math.max(min, GIVING.sweetSpotMin);
  const hi = Math.min(max, GIVING.sweetSpotMax);
  if (hi < lo) return 0;
  const width = max - min;
  return width <= 0 ? 1 : (hi - lo) / width;
}

const PEER_GRANTS_FOR_FULL_CREDIT = 2;

export interface HistoryInput {
  grantAmounts: number[];
  totalGiving: number | null;
  peerGrantCount: number;
  /** Government listings: published award floor/ceiling. */
  awardRange?: { min: number | null; max: number | null };
}

export function historyScore(input: HistoryInput) {
  const parts: { weight: number; value: number }[] = [];
  const amounts = input.grantAmounts.filter((a) => a > 0);

  if (amounts.length > 0) {
    const size = amounts.reduce((s, a) => s + grantSizeCredit(a), 0) / amounts.length;
    parts.push({ weight: GIVING.mix.size, value: size });
    parts.push({
      weight: GIVING.mix.peers,
      value: Math.min(1, input.peerGrantCount / PEER_GRANTS_FOR_FULL_CREDIT),
    });
  } else if (input.awardRange && (input.awardRange.min !== null || input.awardRange.max !== null)) {
    const min = input.awardRange.min ?? input.awardRange.max!;
    const max = input.awardRange.max ?? input.awardRange.min!;
    parts.push({ weight: GIVING.mix.size, value: rangeOverlap(min, max) });
  }

  if (input.totalGiving !== null && input.totalGiving > 0) {
    parts.push({ weight: GIVING.mix.volume, value: Math.min(1, input.totalGiving / GIVING.volumeForFullCredit) });
  }

  if (parts.length === 0) return { score: null };
  const w = parts.reduce((s, p) => s + p.weight, 0);
  return { score: parts.reduce((s, p) => s + p.weight * p.value, 0) / w };
}

export interface AccessInput {
  openCall: boolean | null;
  acceptsUnsolicited: boolean | null;
  route: "loi" | "direct" | "unknown";
  warmIntro: boolean | null;
}

export function accessScore(input: AccessInput) {
  const allUnknown =
    input.openCall === null &&
    input.acceptsUnsolicited === null &&
    input.route === "unknown" &&
    input.warmIntro === null;
  if (allUnknown) return { score: null };
  const score =
    (input.openCall ? ACCESS_POINTS.openCall : 0) +
    (input.acceptsUnsolicited ? ACCESS_POINTS.acceptsUnsolicited : 0) +
    (input.route === "loi" ? ACCESS_POINTS.loiRoute : 0) +
    (input.warmIntro ? ACCESS_POINTS.warmIntro : 0);
  return { score: Math.min(1, score) };
}
