/**
 * Gemini Outreach Assistant: pure rules (no DB, no AI). Picks the outreach type from data the app
 * already has and builds the prompt. Gemini only drafts; a human reviews, edits and sends.
 */
import { z } from "zod";

export const DRAFT_TYPES = ["reconnect_email", "intro_email", "loi", "warm_intro_request"] as const;
export type DraftType = (typeof DRAFT_TYPES)[number];

export const DRAFT_ACTION_LABELS: Record<DraftType, string> = {
  reconnect_email: "Draft reconnect email",
  loi: "Draft LOI starting point",
  intro_email: "Draft intro email",
  warm_intro_request: "Draft warm-introduction request",
};

export const DRAFT_TYPE_LABELS: Record<DraftType, string> = {
  reconnect_email: "Reconnect email",
  loi: "Letter of inquiry (LOI)",
  intro_email: "Intro email",
  warm_intro_request: "Warm-introduction request",
};

export const NOT_CONFIGURED_MESSAGE = "AI drafting is not configured yet.";

/** Approved Tech-Moms mission wording for outreach drafts. */
export const TECH_MOMS_MISSION =
  "Tech-Moms helps women build confidence, skills, and pathways into technology careers through accessible training, workforce development, and professional connections.";

export const MAX_PURPOSE_CHARS = 500;
export const MAX_AMOUNT_CHARS = 50;
export const MAX_NOTES_CHARS = 1_000;
const MAX_SUBJECT_CHARS = 300;
const MAX_BODY_CHARS = 8_000;
const MAX_FACTS = 20;

export interface OutreachSignals {
  /** True only when a recorded grant names Tech-Moms as the recipient. */
  isVerifiedPastFunder: boolean;
  /** Route of the funder's opportunity, if one is on file. */
  route: "loi" | "direct" | "unknown" | null;
  /** From the funder's filing; false means "no unsolicited requests". */
  acceptsUnsolicited: boolean | null;
}

export function pickDraftType({ isVerifiedPastFunder, route, acceptsUnsolicited }: OutreachSignals): DraftType {
  if (isVerifiedPastFunder) return "reconnect_email";
  if (acceptsUnsolicited === false) return "warm_intro_request";
  if (route === "loi") return "loi";
  if (route === "direct") return "intro_email";
  return "warm_intro_request";
}

export const outreachInputSchema = z.object({
  purpose: z.string().trim().min(1, "Please enter a funding purpose.").max(MAX_PURPOSE_CHARS),
  amount: z.string().trim().max(MAX_AMOUNT_CHARS).optional().default(""),
  notes: z.string().trim().max(MAX_NOTES_CHARS).optional().default(""),
});
export type OutreachInput = z.infer<typeof outreachInputSchema>;

export const outreachDraftSchema = z.object({
  draftType: z.enum(DRAFT_TYPES),
  subject: z.string().max(MAX_SUBJECT_CHARS),
  body: z.string().max(MAX_BODY_CHARS),
  factsUsed: z.array(z.string()).max(MAX_FACTS),
  factsToVerify: z.array(z.string()).max(MAX_FACTS),
});
export type OutreachDraft = z.infer<typeof outreachDraftSchema>;

const LENGTH_RULE: Record<DraftType, string> = {
  reconnect_email: "Keep the body under 180 words.",
  intro_email: "Keep the body under 180 words.",
  warm_intro_request: "Keep the body under 180 words.",
  loi: "Keep the body between 300 and 450 words.",
};

const TYPE_RULE: Record<DraftType, string> = {
  reconnect_email:
    "This funder is a verified past funder. Thank them ONLY for the support listed under PROVEN PAST SUPPORT, and propose reconnecting about the new funding purpose.",
  intro_email:
    "This is a new funder with a direct application route. Introduce Tech-Moms and ask for an introductory conversation or whether an application would be appropriate.",
  loi:
    "This is a new funder with an LOI route. Write a letter of inquiry with, in order: 1) a short Tech-Moms introduction, 2) the funding purpose, 3) mission alignment, 4) relevant approved impact facts, 5) a clear next step or request.",
  warm_intro_request:
    "The route to this funder is unknown or they do not accept unsolicited requests. Write a short note to a mutual contact asking whether they would be willing to introduce Tech-Moms to this funder. Do not address the funder directly.",
};

export function buildSystemPrompt(draftType: DraftType): string {
  return `You draft nonprofit outreach for Tech-Moms. A human will review and edit everything; nothing is sent automatically.

Rules:
- Use ONLY the TECH-MOMS FACTS, FUNDER FACTS and USER INPUT provided. Nothing else.
- Never invent names, email addresses, relationships, grant amounts, deadlines, eligibility, or prior funding.
- Never say or imply the funder previously supported Tech-Moms unless it is listed under PROVEN PAST SUPPORT.
- Where information is missing, write a placeholder in [brackets]. Use [Contact name] for any person.
- Warm, concise, professional nonprofit tone.
- ${TYPE_RULE[draftType]}
- ${LENGTH_RULE[draftType]}

Output fields:
- draftType: "${draftType}"
- subject: a short subject line
- body: the draft text
- factsUsed: each fact from the inputs that the draft relies on, short
- factsToVerify: each claim in the draft a human should check before sending, short`;
}

export function buildUserPrompt(orgFacts: string[], funderFacts: string[], pastSupport: string[], input: OutreachInput): string {
  return [
    "TECH-MOMS FACTS:",
    ...orgFacts.map((f) => `- ${f}`),
    "",
    "FUNDER FACTS:",
    ...funderFacts.map((f) => `- ${f}`),
    "",
    "PROVEN PAST SUPPORT:",
    ...(pastSupport.length ? pastSupport.map((f) => `- ${f}`) : ["- None on record."]),
    "",
    "USER INPUT:",
    `- Funding purpose: ${input.purpose}`,
    `- Amount requested: ${input.amount || "[not specified]"}`,
    `- Notes or program to emphasize: ${input.notes || "[none]"}`,
  ].join("\n");
}

/** mailto: link with subject and body only — no recipient, never sent automatically. */
export function buildMailtoHref(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
