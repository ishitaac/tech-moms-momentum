/**
 * Curated Utah state / pass-through listing pages, read each refresh by the AI step.
 * Verified reachable 2026-11-13. Add pages here; no code changes needed.
 */
export interface UtahSource {
  url: string;
  agency: string;
  /** Pages that block automated reading: shown in the app as "check manually" links. */
  manual?: boolean;
}

export const UTAH_SOURCES: UtahSource[] = [
  { url: "https://jobs.utah.gov/department/rfg/employment.html", agency: "Utah Department of Workforce Services" },
  { url: "https://jobs.utah.gov/department/rfg/tanf.html", agency: "Utah Department of Workforce Services" },
  { url: "https://jobs.utah.gov/department/rfg/refugee.html", agency: "Utah Department of Workforce Services" },
  // 403 to automated requests — keep as a manual check link.
  { url: "https://business.utah.gov/grants/", agency: "Utah Governor's Office of Economic Opportunity", manual: true },
];
