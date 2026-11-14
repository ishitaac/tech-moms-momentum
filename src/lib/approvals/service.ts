/**
 * Database side of the approval workflow. Every write re-checks permission, the allowed transition
 * and the content hash inside a conditional UPDATE, so two reviewers (or a stale browser tab) can't
 * approve something that changed or was already decided.
 */
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { can } from "@/lib/auth/roles";
import type { CurrentUser } from "@/lib/auth/session";
import {
  ACTION_PERMISSION,
  allowedFrom,
  contentHash,
  contentTypeOf,
  MAX_BODY_CHARS,
  MAX_NOTE_CHARS,
  nextStatus,
  noteRequired,
  titleFor,
  type ReviewAction,
  type ReviewStatus,
} from "./model";

export type ServiceResult<T = null> = { ok: true; data: T } | { ok: false; error: string };
type Actor = Pick<CurrentUser, "id" | "rawRole">;

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const fail = (error: string): ServiceResult<never> => ({ ok: false, error });

function allowed(actor: Actor, action: ReviewAction) {
  return can(actor.rawRole, ACTION_PERMISSION[action]);
}

async function loadDraft(draftId: number) {
  const [row] = await db
    .select({ draft: schema.drafts, funderName: schema.funders.name })
    .from(schema.drafts)
    .innerJoin(schema.funders, eq(schema.drafts.funderId, schema.funders.id))
    .where(eq(schema.drafts.id, draftId));
  return row ?? null;
}

async function loadReview(reviewId: number) {
  const [row] = await db
    .select({ review: schema.contentReviews, body: schema.drafts.body })
    .from(schema.contentReviews)
    .innerJoin(schema.drafts, eq(schema.contentReviews.draftId, schema.drafts.id))
    .where(eq(schema.contentReviews.id, reviewId));
  return row ?? null;
}

async function logEvent(e: typeof schema.reviewEvents.$inferInsert) {
  await db.insert(schema.reviewEvents).values(e);
}

/** Staff/admin sends a saved draft to the approval queue. Refuses duplicates and already-decided items. */
export async function submitForApproval(actor: Actor, draftId: number): Promise<ServiceResult<{ reviewId: number }>> {
  if (!allowed(actor, "submit")) return fail("You don't have permission to submit drafts.");
  if (!Number.isInteger(draftId) || draftId <= 0) return fail("Draft not found.");
  const found = await loadDraft(draftId);
  if (!found) return fail("Draft not found.");
  const { draft, funderName } = found;
  if (!draft.body.trim()) return fail("The draft is empty.");
  const hash = contentHash(draft.body);
  const now = new Date();

  const [existing] = await db.select().from(schema.contentReviews).where(eq(schema.contentReviews.draftId, draftId));
  if (!existing) {
    const contentType = contentTypeOf(draft.sourceMaterial);
    const [created] = await db
      .insert(schema.contentReviews)
      .values({
        draftId,
        contentType,
        title: titleFor(contentType, funderName, draft.sourceMaterial),
        status: "pending_approval",
        contentHash: hash,
        submittedBy: actor.id,
        submittedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: schema.contentReviews.id });
    if (!created) return fail("This draft is already in the approval queue.");
    await logEvent({ reviewId: created.id, action: "submit", fromStatus: "draft", toStatus: "pending_approval", contentHash: hash, actorId: actor.id });
    return ok({ reviewId: created.id });
  }

  const to = nextStatus("submit", existing.status);
  if (!to) {
    return fail(existing.status === "pending_approval" ? "This draft is already waiting for approval." : `This draft is ${existing.status.replace("_", " ")} and can't be resubmitted.`);
  }
  const [updated] = await db
    .update(schema.contentReviews)
    .set({ status: to, contentHash: hash, submittedBy: actor.id, submittedAt: now, reviewedBy: null, reviewedAt: null, updatedAt: now })
    .where(and(eq(schema.contentReviews.id, existing.id), inArray(schema.contentReviews.status, allowedFrom("submit"))))
    .returning({ id: schema.contentReviews.id });
  if (!updated) return fail("This draft changed status in the meantime. Reload and try again.");
  await logEvent({ reviewId: existing.id, action: "submit", fromStatus: existing.status, toStatus: to, contentHash: hash, actorId: actor.id });
  return ok({ reviewId: existing.id });
}

/**
 * Approve / request changes / reject. `reviewedHash` is the hash the reviewer's screen showed;
 * if the content changed since, the decision is refused as stale.
 */
export async function decide(
  actor: Actor,
  reviewId: number,
  action: "approve" | "request_changes" | "reject",
  reviewedHash: string,
  rawNote: string | null,
): Promise<ServiceResult<{ status: ReviewStatus }>> {
  if (!allowed(actor, action)) return fail("Only admins can approve, reject or request changes.");
  if (!Number.isInteger(reviewId) || reviewId <= 0) return fail("Review not found.");
  const note = rawNote?.trim() || null;
  if (note && note.length > MAX_NOTE_CHARS) return fail(`Notes must be under ${MAX_NOTE_CHARS} characters.`);
  if (noteRequired(action) && !note) return fail("Please add a note explaining what needs to change.");

  const found = await loadReview(reviewId);
  if (!found) return fail("Review not found.");
  const { review, body } = found;
  const to = nextStatus(action, review.status);
  if (!to) return fail(`This item is ${review.status.replace("_", " ")}, so it can't be ${action === "approve" ? "approved" : "changed"} now.`);

  const current = contentHash(body);
  if (current !== review.contentHash || reviewedHash !== current) {
    return fail("The content changed after you opened it. Reload to review the latest version.");
  }
  const now = new Date();
  const [updated] = await db
    .update(schema.contentReviews)
    .set({ status: to, reviewedBy: actor.id, reviewedAt: now, reviewNotes: note, updatedAt: now })
    .where(
      and(
        eq(schema.contentReviews.id, reviewId),
        inArray(schema.contentReviews.status, allowedFrom(action)),
        eq(schema.contentReviews.contentHash, reviewedHash),
      ),
    )
    .returning({ id: schema.contentReviews.id });
  if (!updated) return fail("Someone else updated this item first. Reload to see the latest.");
  await logEvent({ reviewId, action, fromStatus: review.status, toStatus: to, contentHash: current, actorId: actor.id, note });
  return ok({ status: to });
}

/**
 * Edit the content from the review screen.
 * - Admin, while pending: reviewer edit (stays pending, new hash recorded).
 * - Author/staff, while draft or changes requested: fix before resubmitting.
 */
export async function editReviewedContent(actor: Actor, reviewId: number, newBody: string, expectedHash: string): Promise<ServiceResult<{ contentHash: string }>> {
  if (typeof newBody !== "string" || !newBody.trim()) return fail("The draft can't be empty.");
  if (newBody.length > MAX_BODY_CHARS) return fail("The draft is too long to save.");
  const found = await loadReview(reviewId);
  if (!found) return fail("Review not found.");
  const { review, body } = found;
  if (contentHash(body) !== expectedHash) return fail("The content changed after you opened it. Reload first.");

  const isReviewerEdit = review.status === "pending_approval";
  if (isReviewerEdit && !allowed(actor, "reviewer_edit")) return fail("This item is waiting for approval; only a reviewer can edit it now.");
  if (!isReviewerEdit && !(review.status === "draft" || review.status === "changes_requested")) {
    return fail(`This item is ${review.status.replace("_", " ")} and can't be edited.`);
  }
  if (!isReviewerEdit && !can(actor.rawRole, "draft:edit")) return fail("You don't have permission to edit drafts.");

  const hash = contentHash(newBody);
  const now = new Date();
  const [saved] = await db
    .update(schema.drafts)
    .set({ body: newBody, updatedAt: now })
    .where(eq(schema.drafts.id, review.draftId))
    .returning({ id: schema.drafts.id });
  if (!saved) return fail("Could not save the draft.");
  await db.update(schema.contentReviews).set({ contentHash: hash, updatedAt: now }).where(eq(schema.contentReviews.id, reviewId));
  if (hash !== review.contentHash && isReviewerEdit) {
    await logEvent({ reviewId, action: "reviewer_edit", fromStatus: review.status, toStatus: review.status, contentHash: hash, actorId: actor.id });
  }
  return ok({ contentHash: hash });
}

/**
 * Called by the existing draft editors after they save a body in place. A material change to
 * pending or approved content clears the approval (back to draft) so it must be reviewed again.
 */
export async function onDraftBodyChanged(draftId: number, newBody: string, actorId: string | null): Promise<void> {
  const [review] = await db.select().from(schema.contentReviews).where(eq(schema.contentReviews.draftId, draftId));
  if (!review) return;
  const hash = contentHash(newBody);
  if (hash === review.contentHash) return;
  const now = new Date();
  const to = nextStatus("invalidate", review.status);
  if (to) {
    await db.update(schema.contentReviews).set({ status: to, contentHash: hash, updatedAt: now }).where(eq(schema.contentReviews.id, review.id));
    await logEvent({ reviewId: review.id, action: "invalidate", fromStatus: review.status, toStatus: to, contentHash: hash, actorId, note: "Content edited after submission" });
  } else if (review.status === "draft" || review.status === "changes_requested") {
    await db.update(schema.contentReviews).set({ contentHash: hash, updatedAt: now }).where(eq(schema.contentReviews.id, review.id));
  }
}

/** Server-side gate for any "send" or "open in email" step. */
export async function approvalForDraft(draftId: number) {
  const [review] = await db
    .select({ id: schema.contentReviews.id, status: schema.contentReviews.status, contentHash: schema.contentReviews.contentHash, reviewNotes: schema.contentReviews.reviewNotes })
    .from(schema.contentReviews)
    .where(eq(schema.contentReviews.draftId, draftId));
  return review ?? null;
}

/* ---------- Reads for the Approvals pages ---------- */

const submitter = alias(schema.authUsers, "submitter");
const reviewer = alias(schema.authUsers, "reviewer");
const author = alias(schema.authUsers, "author");

export interface ReviewListRow {
  id: number;
  title: string;
  contentType: string;
  status: ReviewStatus;
  createdBy: string | null;
  createdAt: string;
  submittedAt: string | null;
  reviewer: string | null;
  reviewedAt: string | null;
}

export async function listReviews(status: ReviewStatus | null): Promise<ReviewListRow[]> {
  const rows = await db
    .select({
      id: schema.contentReviews.id,
      title: schema.contentReviews.title,
      contentType: schema.contentReviews.contentType,
      status: schema.contentReviews.status,
      authorName: author.name,
      submitterName: submitter.name,
      draftCreatedAt: schema.drafts.updatedAt,
      createdAt: schema.contentReviews.createdAt,
      submittedAt: schema.contentReviews.submittedAt,
      reviewerName: reviewer.name,
      reviewedAt: schema.contentReviews.reviewedAt,
    })
    .from(schema.contentReviews)
    .innerJoin(schema.drafts, eq(schema.contentReviews.draftId, schema.drafts.id))
    .leftJoin(author, eq(schema.drafts.createdBy, author.id))
    .leftJoin(submitter, eq(schema.contentReviews.submittedBy, submitter.id))
    .leftJoin(reviewer, eq(schema.contentReviews.reviewedBy, reviewer.id))
    .where(status ? eq(schema.contentReviews.status, status) : undefined)
    .orderBy(desc(schema.contentReviews.updatedAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    contentType: r.contentType,
    status: r.status,
    createdBy: r.authorName ?? r.submitterName,
    createdAt: r.createdAt.toISOString(),
    submittedAt: r.submittedAt?.toISOString() ?? null,
    reviewer: r.reviewerName,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
  }));
}

export async function reviewCounts(): Promise<Record<ReviewStatus, number>> {
  const rows = await db.select({ status: schema.contentReviews.status, n: count() }).from(schema.contentReviews).groupBy(schema.contentReviews.status);
  const out: Record<ReviewStatus, number> = { draft: 0, pending_approval: 0, approved: 0, changes_requested: 0, rejected: 0 };
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

export async function pendingApprovalCount(): Promise<number> {
  const [r] = await db.select({ n: count() }).from(schema.contentReviews).where(eq(schema.contentReviews.status, "pending_approval"));
  return Number(r?.n ?? 0);
}

export async function reviewDetail(reviewId: number) {
  if (!Number.isInteger(reviewId) || reviewId <= 0) return null;
  const [row] = await db
    .select({
      review: schema.contentReviews,
      body: schema.drafts.body,
      sourceMaterial: schema.drafts.sourceMaterial,
      draftUpdatedAt: schema.drafts.updatedAt,
      funderId: schema.funders.id,
      funderName: schema.funders.name,
      funderCity: schema.funders.city,
      funderState: schema.funders.state,
      funderWebsite: schema.funders.website,
      funderType: schema.funders.type,
      authorName: author.name,
      submitterName: submitter.name,
      reviewerName: reviewer.name,
    })
    .from(schema.contentReviews)
    .innerJoin(schema.drafts, eq(schema.contentReviews.draftId, schema.drafts.id))
    .innerJoin(schema.funders, eq(schema.drafts.funderId, schema.funders.id))
    .leftJoin(author, eq(schema.drafts.createdBy, author.id))
    .leftJoin(submitter, eq(schema.contentReviews.submittedBy, submitter.id))
    .leftJoin(reviewer, eq(schema.contentReviews.reviewedBy, reviewer.id))
    .where(eq(schema.contentReviews.id, reviewId));
  if (!row) return null;

  const actor = alias(schema.authUsers, "actor");
  const history = await db
    .select({
      id: schema.reviewEvents.id,
      action: schema.reviewEvents.action,
      fromStatus: schema.reviewEvents.fromStatus,
      toStatus: schema.reviewEvents.toStatus,
      note: schema.reviewEvents.note,
      contentHash: schema.reviewEvents.contentHash,
      actorName: actor.name,
      createdAt: schema.reviewEvents.createdAt,
    })
    .from(schema.reviewEvents)
    .leftJoin(actor, eq(schema.reviewEvents.actorId, actor.id))
    .where(eq(schema.reviewEvents.reviewId, reviewId))
    .orderBy(desc(schema.reviewEvents.id));

  const [opp] = await db
    .select({ title: schema.opportunities.title, deadline: schema.opportunities.deadline, sourceUrl: schema.opportunities.sourceUrl })
    .from(schema.opportunities)
    .where(eq(schema.opportunities.funderId, row.funderId))
    .orderBy(desc(schema.opportunities.checkedAt))
    .limit(1);

  return { ...row, currentHash: contentHash(row.body), opportunity: opp ?? null, history };
}
export type ReviewDetail = NonNullable<Awaited<ReturnType<typeof reviewDetail>>>;
