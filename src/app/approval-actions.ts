"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { can } from "@/lib/auth/roles";
import { ForbiddenError, requireUser } from "@/lib/auth/session";
import { canSend, MAX_BODY_CHARS, MAX_NOTE_CHARS, type ReviewStatus } from "@/lib/approvals/model";
import { approvalForDraft, decide, editReviewedContent, submitForApproval } from "@/lib/approvals/service";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

function refresh(reviewId?: number) {
  revalidatePath("/approvals");
  if (reviewId) revalidatePath(`/approvals/${reviewId}`);
  revalidatePath("/", "layout"); // pending count in the sidebar
}

async function guarded<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    // redirect() (expired session) must propagate so Next can navigate to /login.
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error("approval action failed", err instanceof Error ? err.message : err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export interface DraftApproval {
  reviewId: number | null;
  status: ReviewStatus | null;
  reviewNotes: string | null;
  /** True only when approved AND the stored text still matches what was approved. */
  canSend: boolean;
  /** The stored, approved text (only when canSend) — the email is built from this, never from browser state. */
  approved: { subject: string; body: string } | null;
  canDecide: boolean;
}

export async function getDraftApproval(draftId: number): Promise<Result<DraftApproval>> {
  return guarded(async () => {
    const user = await requireUser("review:view");
    if (!Number.isInteger(draftId) || draftId <= 0) return { ok: false, error: "Draft not found." };
    const [draft] = await db.select({ body: schema.drafts.body, sourceMaterial: schema.drafts.sourceMaterial }).from(schema.drafts).where(eq(schema.drafts.id, draftId));
    if (!draft) return { ok: false, error: "Draft not found." };
    const r = await approvalForDraft(draftId);
    const sendable = canSend(r?.status, r?.contentHash, draft.body);
    const sm = draft.sourceMaterial as { subject?: unknown } | null;
    return {
      ok: true,
      data: {
        reviewId: r?.id ?? null,
        status: r?.status ?? null,
        reviewNotes: r?.reviewNotes ?? null,
        canSend: sendable,
        approved: sendable ? { subject: typeof sm?.subject === "string" ? sm.subject : "", body: draft.body } : null,
        canDecide: can(user.rawRole, "review:decide"),
      },
    };
  });
}

export async function submitDraftForApproval(draftId: number): Promise<Result<{ reviewId: number }>> {
  return guarded(async () => {
    const user = await requireUser("review:submit");
    const r = await submitForApproval(user, draftId);
    if (r.ok) refresh(r.data.reviewId);
    return r;
  });
}

const decisionSchema = z.object({
  reviewId: z.number().int().positive(),
  action: z.enum(["approve", "request_changes", "reject"]),
  reviewedHash: z.string().regex(/^[a-f0-9]{64}$/),
  note: z.string().max(MAX_NOTE_CHARS).nullable(),
});

export async function decideReview(input: z.infer<typeof decisionSchema>): Promise<Result<{ status: ReviewStatus }>> {
  return guarded(async () => {
    const user = await requireUser("review:decide");
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid request." };
    const { reviewId, action, reviewedHash, note } = parsed.data;
    const r = await decide(user, reviewId, action, reviewedHash, note);
    if (r.ok) refresh(reviewId);
    return r;
  });
}

const editSchema = z.object({
  reviewId: z.number().int().positive(),
  body: z.string().min(1).max(MAX_BODY_CHARS),
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  resubmit: z.boolean().default(false),
});

/** Saves edits from the review screen; staff can save and resubmit in one step. */
export async function saveReviewEdit(input: z.infer<typeof editSchema>): Promise<Result<{ contentHash: string }>> {
  return guarded(async () => {
    const user = await requireUser("draft:edit");
    const parsed = editSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "The draft is empty or too long." };
    const { reviewId, body, expectedHash, resubmit } = parsed.data;
    const r = await editReviewedContent(user, reviewId, body, expectedHash);
    if (r.ok && resubmit) {
      const [row] = await db.select({ draftId: schema.contentReviews.draftId }).from(schema.contentReviews).where(eq(schema.contentReviews.id, reviewId));
      if (row) {
        const s = await submitForApproval(user, row.draftId);
        if (!s.ok) return s;
      }
    }
    if (r.ok) refresh(reviewId);
    return r;
  });
}
