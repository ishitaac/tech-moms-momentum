/** Funding purposes Tech-Moms raises money for. Pure: safe to import from the schema, server and client. */

export const PURPOSES = ["trainers_tas", "scholarships", "childcare", "technology"] as const;
export type Purpose = (typeof PURPOSES)[number];

export const PURPOSE_LABELS: Record<Purpose, string> = {
  trainers_tas: "Trainers / TAs",
  scholarships: "Scholarships",
  childcare: "Childcare",
  technology: "Technology / Program Resources",
};

/** Annual funding goal in dollars per purpose. A missing purpose means no goal set. */
export type PurposeGoals = Partial<Record<Purpose, number>>;

export const isPurpose = (v: unknown): v is Purpose => typeof v === "string" && (PURPOSES as readonly string[]).includes(v);
