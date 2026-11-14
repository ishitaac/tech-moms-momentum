/**
 * Public facts about Tech-Moms used for AI starting drafts (US-10) and mission matching.
 * ONLY public, organization-level facts — never student, staff or donor personal data.
 * TODO(team): expand from Tech-Moms' public website / annual report (see BACKLOG).
 */
export const ORG_PROFILE = {
  name: "Tech-Moms",
  ein: "86-3417178",
  location: "Bountiful, Utah",
  mission: "Tech-Moms helps mothers return to the workforce and pivot careers through technology training.",
  programs: [
    "Tech training cohorts for mothers returning to work or changing careers",
    "Instruction delivered by paid trainers and teaching assistants",
  ],
  fundingUse: "Grants primarily fund trainers and teaching assistants, which drive strong alumni outcomes.",
  typicalAsk: "$5,000–$30,000",
} as const;
