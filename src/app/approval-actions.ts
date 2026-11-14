"use server";

/**
 * Human approval of AI-generated content. Every action:
 *  1. validates the session (database-backed) and the input,
 *  2. locks the row (SELECT … FOR UPDATE) inside a transaction,
 *  3. applies the pure rules in src/lib/approvals/model.ts,
 *  4. writes the change and an audit event together.
 * Nothing here sends email or submits anything to a funder.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import {
  contentHash,
  contentTypeLabel,
  editSchema,
  emailBlockedReason,
  MAX_TITLE_CHARS,
  planEdit,
  planReview,
  planSubmit,
  reviewSchema,
  submitSchema,
  type ApprovalStatus,
} from "@/lib/approvals/model";
import { AuthError, requireActionUser, type CurrentUser } from "@/lib/auth/session";
import { buildMailtoHref } from "@/lib/outreach";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

class RuleError extends Error {}

const MAX_CONTEXT_ITEMS = 40;
const MAX_CONTEXT_CHARS = 500;
const DRAFT_TYPES = new Set(["loi", "intro_email", "reconnect_email", "warm_intro_request"]);

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX_CONTEXT_ITEMS).map((x) => x.slice(0, MAX_CONTEXT_CHARS)) : [];

/** Runs fn with an authenticated user; converts auth and rule failures into friendly results. */
async function guarded<T>(fn: (user: CurrentUser) => Promise<Result<T>>): Promise<Result<T>> {
  try {
    const user = await requireActionUser();
    return await fn(user);
  } catch (err) {
    if (err instanceof AuthError || err instanceof RuleError) return fail(err.message);
    console.error("approval action failed", err);
    return fail("Something went wrong. Nothing was changed. Try again.");
  }
}

function revalidate(id?: number) {
  revalidatePath("/approvals");
  if (id) revalidatePath(`/approvals/${id}`);
}

async function lockItem(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], id: number) {
  const [item] = await tx.select().from(schema.contentApprovals).where(eq(schema.contentApprovals.id, id)).for("update");
  if (!item) throw new RuleError("This item no longer exists.");
  return item;
}

/* ---------------- Create (from an existing AI draft row) ---------------- */

const createSchema = z.object({ draftId: z.number().int().positive(), submit: z.boolean().default(false) });

/** One approval item per draft row: calling twice returns the existing item instead of a duplicate. */
export async function createApprovalFromDraft(input: z.input<typeof createSchema>): Promise<Result<{ id: number; existed: boolean }>> {
  return guarded<{ id: number; existed: boolean }>(async (user) => {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid draft.");
    const { draftId, submit } = parsed.data;

    const [existing] = await db.select({ id: schema.contentApprovals.id }).from(schema.contentApprovals).where(eq(schema.contentApprovals.draftId, draftId));
    if (existing) return { ok: true, data: { id: existing.id, existed: true } };

    const [draft] = await db
      .select({ d: schema.drafts, funderName: schema.funders.name })
      .from(schema.drafts)
      .innerJoin(schema.funders, eq(schema.drafts.funderId, schema.funders.id))
      .where(eq(schema.drafts.id, draftId));
    if (!draft) return fail("Draft not found.");

    const material = (draft.d.sourceMaterial ?? {}) as Record<string, unknown>;
    const isOutreach = material.kind === "outreach";
    const contentType = isOutreach && typeof material.draftType === "string" && DRAFT_TYPES.has(material.draftType) ? material.draftType : "grant_draft";
    const subject = typeof material.subject === "string" ? material.subject.slice(0, 300) : "";
    let context = strings(material.sourceMaterial ?? material.funderFacts);
    if (context.length === 0 && isOutreach) {
      // An edited save doesn't repeat the source list; use the latest server-generated draft for this funder.
      const [gen] = await db
        .select({ m: schema.drafts.sourceMaterial })
        .from(schema.drafts)
        .where(and(eq(schema.drafts.funderId, draft.d.funderId), sql`${schema.drafts.sourceMaterial}->>'kind' = 'outreach'`, sql`${schema.drafts.sourceMaterial} ? 'sourceMaterial'`))
        .orderBy(desc(schema.drafts.id))
        .limit(1);
      context = strings((gen?.m as Record<string, unknown> | undefined)?.sourceMaterial);
    }
    const title = `${contentTypeLabel(contentType)} — ${draft.funderName}`.slice(0, MAX_TITLE_CHARS);
    const hash = contentHash(subject, draft.d.body);
    const status: ApprovalStatus = submit ? "pending_approval" : "draft";

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.contentApprovals)
        .values({
          draftId,
          funderId: draft.d.funderId,
          contentType,
          title,
          subject,
          body: draft.d.body,
          sourceMaterial: context,
          factsToVerify: strings(material.factsToVerify),
          status,
          contentHash: hash,
          createdById: user.id,
          ...(submit ? { submittedById: user.id, submittedAt: new Date() } : {}),
        })
        .onConflictDoNothing({ target: schema.contentApprovals.draftId })
        .returning({ id: schema.contentApprovals.id });
      if (!row) return null; // a concurrent request created it first
      const events: (typeof schema.approvalEvents.$inferInsert)[] = [
        { approvalId: row.id, action: "created", fromStatus: null, toStatus: "draft", actorId: user.id, version: 1, contentHash: hash },
      ];
      if (submit) events.push({ approvalId: row.id, action: "submitted", fromStatus: "draft", toStatus: "pending_approval", actorId: user.id, version: 1, contentHash: hash });
      await tx.insert(schema.approvalEvents).values(events);
      return row.id;
    });
    if (created === null) {
      const [again] = await db.select({ id: schema.contentApprovals.id }).from(schema.contentApprovals).where(eq(schema.contentApprovals.draftId, draftId));
      return again ? { ok: true, data: { id: again.id, existed: true } } : fail("Could not create the approval item.");
    }
    revalidate(created);
    revalidatePath("/", "layout");
    return { ok: true, data: { id: created, existed: false } };
  });
}

/* ---------------- Edit ---------------- */

export async function editApprovalContent(input: z.input<typeof editSchema>): Promise<Result<{ version: number; status: ApprovalStatus; contentHash: string }>> {
  return guarded(async (user) => {
    const parsed = editSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the content.");
    const { id, expectedVersion, subject, body } = parsed.data;

    const out = await db.transaction(async (tx) => {
      const item = await lockItem(tx, id);
      const hash = contentHash(subject, body);
      if (hash === item.contentHash) throw new RuleError("No changes to save.");
      const plan = planEdit(item, user, expectedVersion);
      if (!plan.ok) throw new RuleError(plan.error);
      const version = item.version + 1;
      await tx
        .update(schema.contentApprovals)
        .set({
          subject,
          body,
          version,
          contentHash: hash,
          status: plan.toStatus,
          updatedAt: new Date(),
          // Any approval was for different text: clear it.
          approvedHash: null,
          approvedVersion: null,
          ...(plan.invalidatesApproval ? { reviewedById: null, reviewedAt: null } : {}),
        })
        .where(eq(schema.contentApprovals.id, id));
      const events: (typeof schema.approvalEvents.$inferInsert)[] = [
        { approvalId: id, action: "edited", fromStatus: item.status, toStatus: plan.toStatus, actorId: user.id, version, contentHash: hash },
      ];
      if (plan.invalidatesApproval) {
        events.push({ approvalId: id, action: "approval_invalidated", fromStatus: "approved", toStatus: "draft", actorId: user.id, notes: "Content was edited after approval.", version, contentHash: hash });
      } else if (item.status === "pending_approval") {
        events.push({ approvalId: id, action: "withdrawn_for_edit", fromStatus: "pending_approval", toStatus: "draft", actorId: user.id, notes: "Edited while waiting for review; submit again.", version, contentHash: hash });
      }
      await tx.insert(schema.approvalEvents).values(events);
      return { version, status: plan.toStatus, contentHash: hash };
    });
    revalidate(id);
    return { ok: true, data: out };
  });
}

/* ---------------- Submit ---------------- */

export async function submitForApproval(input: z.input<typeof submitSchema>): Promise<Result> {
  return guarded(async (user) => {
    const parsed = submitSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid request.");
    const { id, expectedVersion } = parsed.data;
    await db.transaction(async (tx) => {
      const item = await lockItem(tx, id);
      const plan = planSubmit(item, user, expectedVersion);
      if (!plan.ok) throw new RuleError(plan.error);
      await tx
        .update(schema.contentApprovals)
        .set({ status: plan.toStatus, submittedById: user.id, submittedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.contentApprovals.id, id));
      await tx.insert(schema.approvalEvents).values({ approvalId: id, action: "submitted", fromStatus: item.status, toStatus: plan.toStatus, actorId: user.id, version: item.version, contentHash: item.contentHash });
    });
    revalidate(id);
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  });
}

/* ---------------- Review (admin, not the author) ---------------- */

export async function reviewApproval(input: z.input<typeof reviewSchema>): Promise<Result<{ status: ApprovalStatus }>> {
  return guarded(async (user) => {
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the review.");
    const { id, expectedVersion, expectedHash, decision, notes } = parsed.data;
    const status = await db.transaction(async (tx) => {
      const item = await lockItem(tx, id);
      const plan = planReview(item, user, decision, expectedVersion, expectedHash);
      if (!plan.ok) throw new RuleError(plan.error);
      const now = new Date();
      await tx
        .update(schema.contentApprovals)
        .set({
          status: plan.toStatus,
          reviewedById: user.id,
          reviewedAt: now,
          reviewNotes: notes || null,
          approvedHash: plan.toStatus === "approved" ? item.contentHash : null,
          approvedVersion: plan.toStatus === "approved" ? item.version : null,
          updatedAt: now,
        })
        .where(and(eq(schema.contentApprovals.id, id), eq(schema.contentApprovals.status, "pending_approval"), eq(schema.contentApprovals.version, expectedVersion)));
      await tx.insert(schema.approvalEvents).values({
        approvalId: id,
        action: decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "changes_requested",
        fromStatus: item.status,
        toStatus: plan.toStatus,
        actorId: user.id,
        notes: notes || null,
        version: item.version,
        contentHash: item.contentHash,
      });
      return plan.toStatus;
    });
    revalidate(id);
    revalidatePath("/", "layout");
    return { ok: true, data: { status } };
  });
}

/* ---------------- External action: a separate, confirmed, logged step ---------------- */

const emailSchema = z.object({ id: z.number().int().positive(), expectedVersion: z.number().int().positive(), expectedHash: z.string().regex(/^[a-f0-9]{64}$/) });

/**
 * Called only after the person confirms in a dialog. Re-checks the approval on the server, logs it,
 * and returns a mailto: link with no recipient: their own email app opens and THEY choose to send.
 * The app never sends outreach itself, and never for demo/sample funders.
 */
export async function prepareApprovedEmail(input: z.input<typeof emailSchema>): Promise<Result<{ href: string }>> {
  return guarded(async (user) => {
    const parsed = emailSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid request.");
    const { id, expectedVersion, expectedHash } = parsed.data;
    const href = await db.transaction(async (tx) => {
      const item = await lockItem(tx, id);
      if (user.role !== "admin" && item.createdById !== user.id) throw new RuleError("Only the author or an admin can do this.");
      if (item.version !== expectedVersion || item.contentHash !== expectedHash) throw new RuleError("This content changed since you opened it. Reload first.");
      const [funder] = await tx.select({ name: schema.funders.name }).from(schema.funders).where(eq(schema.funders.id, item.funderId));
      const blocked = emailBlockedReason({ ...item, funderName: funder?.name ?? "" });
      if (blocked) throw new RuleError(blocked);
      await tx.insert(schema.approvalEvents).values({
        approvalId: id,
        action: "opened_in_email",
        fromStatus: item.status,
        toStatus: item.status,
        actorId: user.id,
        notes: "Opened in the user's email app after confirmation. Not sent by Funder Finder.",
        version: item.version,
        contentHash: item.contentHash,
      });
      return buildMailtoHref(item.subject, item.body);
    });
    revalidate(id);
    return { ok: true, data: { href } };
  });
}
