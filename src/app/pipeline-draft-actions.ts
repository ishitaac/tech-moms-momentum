"use server";

import { generateText, Output } from "ai";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getGeminiModel } from "@/lib/ai/gemini";
import { NOT_CONFIGURED_MESSAGE } from "@/lib/outreach";
import { loadFunderFacts, orgFacts } from "@/lib/outreach-facts";
import {
  buildPipelineSystemPrompt,
  buildPipelineUserPrompt,
  draftTypeForStage,
  pipelineDraftInputSchema,
  pipelineDraftSchema,
  type PipelineDraft,
} from "@/lib/pipeline-draft";
import { STAGE_NAME } from "@/components/pipeline/stage-names";
import { usd } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

/** Gemini can stall under high demand; fail with a friendly message instead of hanging the modal. */
const GEMINI_TIMEOUT_MS = 60_000;
const GEMINI_MAX_RETRIES = 1;

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface PipelineDraftResult {
  draft: PipelineDraft;
  sourceMaterial: string[];
}

export async function isPipelineDraftConfigured(): Promise<boolean> {
  await requireUser("app:use");
  return getGeminiModel().ok;
}

/** Runs only when the user clicks Generate. Drafts only — never sends or submits anything. */
export async function generatePipelineDraft(pipelineItemId: number, rawInput: unknown): Promise<Result<PipelineDraftResult>> {
  await requireUser("draft:generate");
  if (!Number.isInteger(pipelineItemId)) return { ok: false, error: "Pipeline card not found." };
  const parsed = pipelineDraftInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your inputs." };

  const gemini = getGeminiModel();
  if (!gemini.ok) return { ok: false, error: NOT_CONFIGURED_MESSAGE };

  // Stage, funder and amount come from the database, not the browser.
  const [item] = await db.select().from(schema.pipelineItems).where(eq(schema.pipelineItems.id, pipelineItemId));
  if (!item) return { ok: false, error: "Pipeline card not found." };
  const draftType = draftTypeForStage(item.stage);
  if (!draftType) return { ok: false, error: "AI drafts are only available for Prospect and LOI cards." };

  const facts = await loadFunderFacts(item.funderId, item.opportunityId);
  if (!facts) return { ok: false, error: "Funder not found." };

  const org = orgFacts();
  const amountAskedOnCard = item.amountAsked ? usd(item.amountAsked) : null;
  try {
    const result = await generateText({
      model: gemini.model,
      system: buildPipelineSystemPrompt(draftType),
      prompt: buildPipelineUserPrompt({
        orgFacts: org,
        funderFacts: facts.funderFacts,
        pastSupport: facts.pastSupport,
        sourceUrls: facts.sourceUrls,
        stageName: STAGE_NAME[item.stage],
        amountAskedOnCard,
        input: parsed.data,
      }),
      output: Output.object({ schema: pipelineDraftSchema }),
      maxRetries: GEMINI_MAX_RETRIES,
      abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (!result.output) return { ok: false, error: "Could not create a draft. Try again." };
    // The type is decided by the card's stage, not by the model.
    const draft: PipelineDraft = { ...result.output, draftType };
    const sourceMaterial = [...org, ...facts.funderFacts, ...facts.pastSupport, ...facts.sourceUrls.map((u) => `Source: ${u}`)];
    return { ok: true, data: { draft, sourceMaterial } };
  } catch (err) {
    console.error("pipeline draft failed", err);
    return { ok: false, error: "Could not create a draft. Gemini may be busy — try again in a minute." };
  }
}

/** Saves the human-edited draft to the existing drafts table. Returns its id so it can be submitted for approval. */
export async function savePipelineDraft(pipelineItemId: number, rawDraft: unknown): Promise<Result<{ draftId: number }>> {
  const user = await requireUser("draft:edit");
  if (!Number.isInteger(pipelineItemId)) return { ok: false, error: "Pipeline card not found." };
  const parsed = pipelineDraftSchema.safeParse(rawDraft);
  if (!parsed.success) return { ok: false, error: "Draft is too long to save." };
  try {
    const [item] = await db.select({ funderId: schema.pipelineItems.funderId }).from(schema.pipelineItems).where(eq(schema.pipelineItems.id, pipelineItemId));
    if (!item) return { ok: false, error: "Pipeline card not found." };
    const [row] = await db
      .insert(schema.drafts)
      .values({
        funderId: item.funderId,
        body: parsed.data.body,
        sourceMaterial: { kind: "pipeline", pipelineItemId, ...parsed.data },
        createdBy: user.id,
      })
      .returning({ id: schema.drafts.id });
    if (!row) return { ok: false, error: "Could not save. Try again." };
    return { ok: true, data: { draftId: row.id } };
  } catch (err) {
    console.error("pipeline draft save failed", err);
    return { ok: false, error: "Could not save. Try again." };
  }
}
