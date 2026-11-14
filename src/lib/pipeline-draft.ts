/**
 * Gemini drafting from Pipeline cards: pure rules (no DB, no AI).
 * Prospect cards draft a personalized outreach email; LOI cards draft a letter of intent.
 * Drafts are editable starting points only — never sent or submitted automatically.
 */
import { z } from "zod";
import type { Stage } from "@/lib/pipeline-model";

export const PIPELINE_DRAFT_TYPES = ["outreach_email", "loi"] as const;
export type PipelineDraftType = (typeof PIPELINE_DRAFT_TYPES)[number];

/** Only Prospect and LOI cards get a Gemini action. */
export function draftTypeForStage(stage: Stage): PipelineDraftType | null {
  if (stage === "prospect") return "outreach_email";
  if (stage === "loi") return "loi";
  return null;
}

export const PIPELINE_DRAFT_UI: Record<PipelineDraftType, { action: string; helper: string; label: string; generate: string }> = {
  outreach_email: {
    action: "Draft personalized outreach",
    helper: "Create an editable first email from public funder information.",
    label: "Personalized outreach email",
    generate: "Generate outreach draft with Gemini",
  },
  loi: {
    action: "Generate AI LOI draft",
    helper: "Creates an editable starting point from public sources.",
    label: "Letter of Intent",
    generate: "Generate LOI with Gemini",
  },
};

export const MAX_PURPOSE_CHARS = 500;
export const MAX_AMOUNT_CHARS = 50;
export const MAX_NOTES_CHARS = 1_000;
const MAX_SUBJECT_CHARS = 300;
const MAX_BODY_CHARS = 8_000;
const MAX_FACTS = 20;

export const pipelineDraftInputSchema = z.object({
  purpose: z.string().trim().min(1, "Please enter a funding purpose.").max(MAX_PURPOSE_CHARS),
  amount: z.string().trim().max(MAX_AMOUNT_CHARS).optional().default(""),
  notes: z.string().trim().max(MAX_NOTES_CHARS).optional().default(""),
});
export type PipelineDraftInput = z.infer<typeof pipelineDraftInputSchema>;

export const pipelineDraftSchema = z.object({
  draftType: z.enum(PIPELINE_DRAFT_TYPES),
  subject: z.string().max(MAX_SUBJECT_CHARS),
  body: z.string().max(MAX_BODY_CHARS),
  factsUsed: z.array(z.string().max(500)).max(MAX_FACTS),
  factsToVerify: z.array(z.string().max(500)).max(MAX_FACTS),
});
export type PipelineDraft = z.infer<typeof pipelineDraftSchema>;

const TYPE_RULES: Record<PipelineDraftType, string> = {
  outreach_email: `Write a personalized outreach EMAIL.
- Maximum 180 words in the body.
- Warm, concise, professional nonprofit tone.
- Ask for an introductory conversation, or ask whether a letter of intent (LOI) would be appropriate.
- Greet "[Contact name]" unless a public contact is supplied.
- subject: a short email subject line.`,
  loi: `Write a LETTER OF INTENT (LOI).
- Body between 300 and 450 words (aim for about 375; under 300 is too short). Philanthropy- and foundation-appropriate language.
- Develop each section in a full paragraph of 3–5 sentences, using bracketed placeholders for details not supplied.
- Include, in order:
  1. A date placeholder "[Date]"
  2. Greeting "Dear [Contact name],"
  3. A short Tech-Moms introduction
  4. The funding purpose
  5. The request amount, or "[amount requested]" if none is supplied
  6. Why the request aligns with the funder's documented priorities (only those in FUNDER FACTS)
  7. Relevant approved Tech-Moms impact facts, only if supplied
  8. A warm closing and a request for next steps
- subject: a short letter title, e.g. "Letter of Intent: <purpose>".`,
};

export function buildPipelineSystemPrompt(draftType: PipelineDraftType): string {
  return `You draft funding outreach for Tech-Moms, a nonprofit. A human reviews and edits everything; nothing is sent or submitted automatically.

${TYPE_RULES[draftType]}

Rules for every draft:
- Use ONLY the TECH-MOMS FACTS, FUNDER FACTS, PROVEN PAST SUPPORT, PIPELINE and USER INPUT provided.
- Never invent a relationship, contact, grant amount, deadline, eligibility, grant requirement, outcome, or prior funding.
- Never mention past support unless it is listed under PROVEN PAST SUPPORT.
- Never present a fit score or match as a promise or likelihood of funding.
- Where information is missing, write a [bracketed placeholder] and list it in factsToVerify.
- Format the body as real paragraphs separated by a blank line (and the LOI date and greeting on their own lines).

Output fields:
- draftType: "${draftType}"
- subject, body
- factsUsed: each supplied fact the draft relies on, short
- factsToVerify: each claim or [placeholder] a human must check before sending, short`;
}

export function buildPipelineUserPrompt(args: {
  orgFacts: string[];
  funderFacts: string[];
  pastSupport: string[];
  sourceUrls: string[];
  stageName: string;
  amountAskedOnCard: string | null;
  input: PipelineDraftInput;
}): string {
  const { orgFacts, funderFacts, pastSupport, sourceUrls, stageName, amountAskedOnCard, input } = args;
  const list = (items: string[], empty: string) => (items.length ? items.map((f) => `- ${f}`) : [`- ${empty}`]);
  return [
    "TECH-MOMS FACTS:",
    ...list(orgFacts, "None."),
    "",
    "FUNDER FACTS (public sources):",
    ...list(funderFacts, "None."),
    "",
    "SOURCE URLS:",
    ...list(sourceUrls, "None."),
    "",
    "PROVEN PAST SUPPORT:",
    ...list(pastSupport, "None on record."),
    "",
    "PIPELINE:",
    `- Current stage: ${stageName}`,
    `- Amount asked on record: ${amountAskedOnCard ?? "[not recorded]"}`,
    "",
    "USER INPUT:",
    `- Funding purpose: ${input.purpose}`,
    `- Amount requested: ${input.amount || amountAskedOnCard || "[amount requested]"}`,
    `- Notes or program to emphasize: ${input.notes || "[none]"}`,
  ].join("\n");
}

/** mailto: with subject and body only — no recipient, never sent automatically. */
export function buildMailtoHref(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
