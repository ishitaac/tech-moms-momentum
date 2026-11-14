"use server";

import { generateText } from "ai";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isEnabled } from "@/config/flags";
import { ORG_PROFILE } from "@/config/org-profile";
import { getModel, isAiConfigured, modelId, UsageMeter } from "@/lib/ai/provider";

const MAX_DRAFT_CHARS = 20_000;
const DRAFT_TOKEN_CAP = 20_000;

const PROMPT = `Write a short STARTING DRAFT (about 250 words) of a grant inquiry letter from Tech-Moms
to the funder below. Use only the facts provided. Where a fact is missing, write a bracketed placeholder
like [program outcome] instead of inventing it. Plain, warm, specific. No subject line.`;

export interface DraftState {
  body: string;
  sourceMaterial: { orgFacts: typeof ORG_PROFILE; funderFacts: string[]; model: string } | null;
  updatedAt: string | null;
}

export async function getDraft(funderId: number): Promise<DraftState | null> {
  if (!Number.isInteger(funderId)) return null;
  const [d] = await db.select().from(schema.drafts).where(eq(schema.drafts.funderId, funderId)).orderBy(desc(schema.drafts.updatedAt)).limit(1);
  if (!d) return null;
  return { body: d.body, sourceMaterial: d.sourceMaterial as DraftState["sourceMaterial"], updatedAt: d.updatedAt.toISOString() };
}

/** Only runs when the user clicks "Draft starting point". Off unless FLAG_AI_DRAFT=true. */
export async function generateDraft(funderId: number): Promise<{ ok: true; draft: DraftState } | { ok: false; error: string }> {
  if (!isEnabled("aiDraft")) return { ok: false, error: "AI drafts are turned off." };
  if (!isAiConfigured()) return { ok: false, error: "No AI key configured." };
  const [funder] = await db.select().from(schema.funders).where(eq(schema.funders.id, funderId));
  if (!funder) return { ok: false, error: "Funder not found." };

  const [score] = await db.select().from(schema.scores).where(eq(schema.scores.funderId, funderId)).orderBy(desc(schema.scores.id)).limit(1);
  const fields = await db.select().from(schema.extractedFields).where(eq(schema.extractedFields.funderId, funderId));
  const funderFacts = [
    `Funder: ${funder.name}${funder.state ? ` (${funder.state})` : ""}`,
    score?.reason ? `Why it fits: ${score.reason}` : null,
    ...fields
      .filter((f) => f.field === "application_info" || f.field === "mission_rating")
      .map((f) => `${f.field}: ${JSON.stringify(f.value)}`),
  ].filter((x): x is string => !!x);

  const meter = new UsageMeter(DRAFT_TOKEN_CAP);
  try {
    const result = await generateText({
      model: getModel("explain"),
      system: PROMPT,
      prompt: `TECH-MOMS FACTS:\n${JSON.stringify(ORG_PROFILE, null, 2)}\n\nFUNDER FACTS:\n${funderFacts.join("\n")}`,
    });
    meter.record("explain", result.usage);
    const sourceMaterial = { orgFacts: ORG_PROFILE, funderFacts, model: modelId("explain") };
    const body = result.text.slice(0, MAX_DRAFT_CHARS);
    await db.insert(schema.drafts).values({ funderId, body, sourceMaterial });
    return { ok: true, draft: { body, sourceMaterial, updatedAt: new Date().toISOString() } };
  } catch (err) {
    console.error("draft failed", err);
    return { ok: false, error: "Could not generate a draft. Try again later." };
  }
}

export async function saveDraft(funderId: number, body: string): Promise<{ ok: boolean }> {
  if (!Number.isInteger(funderId) || body.length > MAX_DRAFT_CHARS) return { ok: false };
  const [d] = await db.select({ id: schema.drafts.id }).from(schema.drafts).where(eq(schema.drafts.funderId, funderId)).orderBy(desc(schema.drafts.updatedAt)).limit(1);
  if (!d) return { ok: false };
  await db.update(schema.drafts).set({ body, updatedAt: new Date() }).where(eq(schema.drafts.id, d.id));
  return { ok: true };
}
