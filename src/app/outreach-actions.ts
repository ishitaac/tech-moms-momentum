"use server";

import { generateText, Output } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isEnabled } from "@/config/flags";
import { ORG_PROFILE } from "@/config/org-profile";
import { getGeminiModel } from "@/lib/ai/gemini";
import { normalizeOrgName } from "@/lib/irs/normalize";
import { usd } from "@/components/ui";
import {
  buildSystemPrompt,
  buildUserPrompt,
  NOT_CONFIGURED_MESSAGE,
  outreachDraftSchema,
  outreachInputSchema,
  pickDraftType,
  TECH_MOMS_MISSION,
  type DraftType,
  type OutreachDraft,
} from "@/lib/outreach";

const SELF = normalizeOrgName("Tech-Moms");
const MAX_FACT_CHARS = 300;
/** Gemini can stall under high demand; fail with a friendly message instead of hanging the panel. */
const GEMINI_TIMEOUT_MS = 60_000;
const GEMINI_MAX_RETRIES = 1;

export interface OutreachContext {
  configured: boolean;
  draftType: DraftType;
}

export interface OutreachResult {
  draft: OutreachDraft;
  sourceMaterial: string[];
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const clip = (s: string) => (s.length > MAX_FACT_CHARS ? `${s.slice(0, MAX_FACT_CHARS - 1)}…` : s);

/** Gathers only facts that already exist for this funder. */
async function loadFunderFacts(funderId: number, opportunityId: number | null) {
  const [funder] = await db.select().from(schema.funders).where(eq(schema.funders.id, funderId));
  if (!funder) return null;

  const [grants, opps, [score], fields] = await Promise.all([
    db.select().from(schema.grantsMade).where(eq(schema.grantsMade.funderId, funderId)),
    db.select().from(schema.opportunities).where(eq(schema.opportunities.funderId, funderId)),
    db.select().from(schema.scores).where(eq(schema.scores.funderId, funderId)).orderBy(desc(schema.scores.id)).limit(1),
    db
      .select()
      .from(schema.extractedFields)
      .where(and(eq(schema.extractedFields.funderId, funderId), eq(schema.extractedFields.field, "application_info"))),
  ]);

  const pastGrants = grants.filter((g) => normalizeOrgName(g.recipientName) === SELF);
  const opp = opps.find((o) => o.id === opportunityId) ?? opps.find((o) => o.isOpen === "open") ?? opps[0] ?? null;

  const funderFacts = [
    `Funder name: ${funder.name}`,
    funder.city || funder.state ? `Location: ${[funder.city, funder.state].filter(Boolean).join(", ")}` : null,
    funder.purpose ? `Stated purpose: ${clip(funder.purpose)}` : null,
    funder.acceptsUnsolicited === false ? "Filing says it does not accept unsolicited requests." : null,
    score?.reason ? `Why it fits Tech-Moms: ${clip(score.reason)}` : null,
    opp ? `Opportunity: ${clip(opp.title)} (application route: ${opp.route})` : null,
    opp?.deadline ? `Deadline on record: ${opp.deadline}` : null,
    opp && (opp.awardMin || opp.awardMax) ? `Award range on record: ${[opp.awardMin, opp.awardMax].filter(Boolean).map((n) => usd(n)).join(" – ")}` : null,
    opp?.eligibility ? `Eligibility: ${clip(opp.eligibility)}` : null,
    ...fields.map((f) => `Application info: ${clip(JSON.stringify(f.value))}`),
  ].filter((x): x is string => !!x);

  const pastSupport = pastGrants.map(
    (g) => `Grant to ${g.recipientName}${g.amount ? ` of ${usd(g.amount)}` : ""}${g.purpose ? ` for ${clip(g.purpose)}` : ""} (public tax filing)`,
  );

  const draftType = pickDraftType({
    isVerifiedPastFunder: pastGrants.length > 0,
    route: opp?.route ?? null,
    acceptsUnsolicited: funder.acceptsUnsolicited,
  });

  return { funderFacts, pastSupport, draftType };
}

function orgFacts(): string[] {
  return [
    `Mission: ${TECH_MOMS_MISSION}`,
    `Location: ${ORG_PROFILE.location}`,
    ...ORG_PROFILE.programs.map((p) => `Program: ${p}`),
    `How grants are used: ${ORG_PROFILE.fundingUse}`,
  ];
}

function validIds(funderId: unknown, opportunityId: unknown): opportunityId is number | null {
  return Number.isInteger(funderId) && (opportunityId === null || Number.isInteger(opportunityId));
}

export async function getOutreachContext(funderId: number, opportunityId: number | null): Promise<Result<OutreachContext>> {
  if (!isEnabled("aiDraft")) return { ok: false, error: "AI drafts are turned off." };
  if (!validIds(funderId, opportunityId)) return { ok: false, error: "Funder not found." };
  const facts = await loadFunderFacts(funderId, opportunityId);
  if (!facts) return { ok: false, error: "Funder not found." };
  return { ok: true, data: { configured: getGeminiModel().ok, draftType: facts.draftType } };
}

/** Runs only when the user clicks. Drafts only — never sends anything. */
export async function generateOutreachDraft(
  funderId: number,
  opportunityId: number | null,
  rawInput: unknown,
): Promise<Result<OutreachResult>> {
  if (!isEnabled("aiDraft")) return { ok: false, error: "AI drafts are turned off." };
  if (!validIds(funderId, opportunityId)) return { ok: false, error: "Funder not found." };

  const parsed = outreachInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your inputs." };

  const gemini = getGeminiModel();
  if (!gemini.ok) return { ok: false, error: NOT_CONFIGURED_MESSAGE };

  const facts = await loadFunderFacts(funderId, opportunityId);
  if (!facts) return { ok: false, error: "Funder not found." };

  const org = orgFacts();
  try {
    const result = await generateText({
      model: gemini.model,
      system: buildSystemPrompt(facts.draftType),
      prompt: buildUserPrompt(org, facts.funderFacts, facts.pastSupport, parsed.data),
      output: Output.object({ schema: outreachDraftSchema }),
      maxRetries: GEMINI_MAX_RETRIES,
      abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (!result.output) return { ok: false, error: "Could not create a draft. Try again." };
    // The type is decided by our data, not by the model.
    const draft: OutreachDraft = { ...result.output, draftType: facts.draftType };
    const sourceMaterial = [...org, ...facts.funderFacts, ...facts.pastSupport];
    await db.insert(schema.drafts).values({
      funderId,
      body: draft.body,
      sourceMaterial: { kind: "outreach", ...draft, input: parsed.data, sourceMaterial, model: gemini.modelId },
    });
    return { ok: true, data: { draft, sourceMaterial } };
  } catch (err) {
    console.error("outreach draft failed", err);
    return { ok: false, error: "Could not create a draft. Try again later." };
  }
}

/** Saves the human-edited version as a new row in the existing drafts table (no schema change). */
export async function saveOutreachDraft(funderId: number, rawDraft: unknown): Promise<Result<null>> {
  if (!isEnabled("aiDraft")) return { ok: false, error: "AI drafts are turned off." };
  if (!Number.isInteger(funderId)) return { ok: false, error: "Funder not found." };
  const parsed = outreachDraftSchema.safeParse(rawDraft);
  if (!parsed.success) return { ok: false, error: "Draft is too long to save." };
  try {
    await db.insert(schema.drafts).values({
      funderId,
      body: parsed.data.body,
      sourceMaterial: { kind: "outreach", editedByUser: true, ...parsed.data },
    });
    return { ok: true, data: null };
  } catch (err) {
    console.error("outreach save failed", err);
    return { ok: false, error: "Could not save. Try again." };
  }
}
