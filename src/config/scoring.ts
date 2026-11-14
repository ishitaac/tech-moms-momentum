/**
 * Fit-score configuration. Weights are starting guesses (PRD §Fit score) to tune with Robbyn.
 * Change numbers here, not in src/lib/scoring.
 */

export const COMPONENT_KEYS = ["mission", "women", "geography", "history", "access"] as const;
export type ComponentKey = (typeof COMPONENT_KEYS)[number];
export type Weights = Record<ComponentKey, number>;

export const DEFAULT_WEIGHTS: Weights = {
  mission: 0.35,
  women: 0.15,
  geography: 0.2,
  history: 0.2,
  access: 0.1,
};

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  mission: "Mission & vision match",
  women: "Women & girls empowerment",
  geography: "Geography",
  history: "Past giving history",
  access: "Accessibility",
};

export const BANDS = {
  // Calibrated 2026-11-13 against known Tech-Moms funders (PRD said 75/55, provisional). See BACKLOG.
  strongMin: 50,
  worthMin: 35,
  /** "Strong" also requires at least this many components with real evidence. */
  strongMinEvidence: 3,
} as const;
export type Band = "Strong" | "Worth a look" | "Long shot";

export const CONFIDENCE = { highMin: 0.8, mediumMin: 0.6 } as const;
export type Confidence = "high" | "medium" | "low";

/** Mission component = keyword share + AI anchored read share. */
export const MISSION_MIX = { keyword: 0.5, ai: 0.5 } as const;

export const MISSION_KEYWORDS = [
  "workforce development",
  "workforce",
  "return to work",
  "returnship",
  "career pivot",
  "career change",
  "reskilling",
  "upskilling",
  "tech training",
  "technology training",
  "digital skills",
  "digital literacy",
  "coding",
  "software",
  "stem",
  "job training",
  "economic mobility",
  "economic opportunity",
];
/** Number of distinct keyword hits that earns full keyword credit. */
export const MISSION_KEYWORD_SATURATION = 4;

export const WOMEN_KEYWORDS = [
  "women",
  "woman",
  "girls",
  "mothers",
  "moms",
  "mom",
  "caregivers",
  "caregiver",
  "female",
  "gender equity",
  "single parents",
];
export const WOMEN_KEYWORD_SATURATION = 2;
/** Text that looks like a women keyword but isn't a women/girls program. */
export const WOMEN_FALSE_POSITIVES = /\bboys\s*(?:&|and)\s*girls\b/gi;

/**
 * For foundations, mission and women are scored on the SHARE of past grants that match,
 * so large generalist funders with thousands of grants don't win on volume.
 * Share at or above these values earns full credit.
 */
export const MISSION_GRANT_SHARE_FULL = 0.15;
export const WOMEN_GRANT_SHARE_FULL = 0.1;

export const GEOGRAPHY = {
  homeState: "UT",
  /** Mountain West, partial credit. */
  region: ["ID", "NV", "AZ", "CO", "WY", "MT", "NM"],
  /** Credit per unit of Mountain West dollar share (no Utah) — partial by design. */
  regionCredit: 0.4,
  /** Utah dollar share at or above this earns full credit. */
  homeShareForFullCredit: 0.5,
} as const;

export const GIVING = {
  sweetSpotMin: 5_000,
  sweetSpotMax: 30_000,
  /** Total annual giving at or above this earns full volume credit. */
  volumeForFullCredit: 250_000,
  /** Weighting inside the history component. */
  mix: { size: 0.5, volume: 0.2, peers: 0.3 },
} as const;

export const ACCESS_POINTS = {
  openCall: 0.5,
  acceptsUnsolicited: 0.25,
  loiRoute: 0.15,
  warmIntro: 0.1,
} as const;

export const GATES = {
  /** Foundation must have made grants within this many filing years of the latest available. */
  activeWithinYears: 2,
} as const;

/** Top N (by deterministic score) that get AI extraction and appear in the default list view. */
export const SHORTLIST_SIZE = 150;

/** Rejected funders resurface if total giving changes by more than this fraction. */
export const REJECT_RESURFACE_GIVING_CHANGE = 0.5;
