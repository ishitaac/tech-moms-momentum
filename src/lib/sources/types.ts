/** Every data source implements this so sources stay pluggable and one failure never blocks a refresh. */

export interface SourceError {
  source: string;
  message: string;
  url?: string;
}

export interface Opportunity {
  externalId: string;
  funderName: string;
  funderType: "federal" | "state" | "corporate" | "foundation" | "family_foundation";
  title: string;
  description: string | null;
  eligibility: string | null;
  geography: string | null;
  awardMin: number | null;
  awardMax: number | null;
  /** ISO YYYY-MM-DD or null for rolling/unknown. */
  deadline: string | null;
  isOpen: "open" | "unknown";
  route: "loi" | "direct" | "unknown";
  sourceUrl: string;
  website: string | null;
}

export interface SourceResult {
  items: Opportunity[];
  errors: SourceError[];
  fetchedAt: Date;
}

export interface SourceAdapter {
  id: string;
  label: string;
  /** Must not throw: return errors in the result instead. */
  fetch(): Promise<SourceResult>;
}
