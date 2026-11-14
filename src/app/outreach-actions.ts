"use server";

import { generateText, Output } from "ai";
import { db, schema } from "@/db";
import { isEnabled } from "@/config/flags";
import { getGeminiModel } from "@/lib/ai/gemini";
import { loadFunderFacts, orgFacts } from "@/lib/outreach-facts";
import {
  buildSystemPrompt,
  buildUserPrompt,
  NOT_CONFIGURED_MESSAGE,
  outreachDraftSchema,
  outreachInputSchema,
  type DraftType,
  type OutreachDraft,
} from "@/lib/outreach";

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
