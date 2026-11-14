/**
 * Human approval of AI-generated content: the state machine and permission rules.
 * Pure (no DB, no framework) so every rule is unit tested. The server actions call this and then
 * apply the change with a conditional UPDATE, so a stale or duplicate review cannot slip through.
 *
 * This is NOT the funder approve/snooze/reject decision (src/app/actions.ts → decide()).
 *
 *   DRAFT ──submit──▶ PENDING_APPROVAL ──approve──────────▶ APPROVED
 *     ▲                     │      └────request changes──▶ CHANGES_REQUESTED ──submit──▶ PENDING_APPROVAL
 *     └──── edit ◀──────────┘──────reject────────────────▶ REJECTED (final, read-only)
 *   Editing PENDING or APPROVED content returns it to DRAFT and clears the approval.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { canAuthor, canReview, type Role } from "@/lib/auth/roles";

export const APPROVAL_STATUSES = ["draft", "pending_approval", "approved", "changes_requested", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const STATUS_LABELS: Record<ApprovalStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  changes_requested: "Changes requested",
  rejected: "Rejected",
};

export const REVIEW_DECISIONS = ["approve", "request_changes", "reject"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const DECISION_LABELS: Record<ReviewDecision, string> = {
  approve: "Approve",
  request_changes: "Request changes",
  reject: "Reject",
};

const DECISION_TO_STATUS: Record<ReviewDecision, ApprovalStatus> = {
  approve: "approved",
  request_changes: "changes_requested",
  reject: "rejected",
};

/** Content types that exist in the app today (outreach draft types + the legacy grant inquiry draft). */
export const CONTENT_TYPE_LABELS: Record<string, string> = {
  loi: "Grant letter of inquiry (LOI)",
  intro_email: "Funder intro email",
  reconnect_email: "Past-funder reconnect email",
  warm_intro_request: "Warm-introduction request",
  grant_draft: "Grant inquiry draft",
};
export const contentTypeLabel = (t: string) => CONTENT_TYPE_LABELS[t] ?? "AI draft";

export const MAX_TITLE_CHARS = 200;
export const MAX_SUBJECT_CHARS = 300;
export const MAX_BODY_CHARS = 20_000;
export const MAX_NOTES_CHARS = 2_000;

export const editSchema = z.object({
  id: z.number().int().positive(),
  expectedVersion: z.number().int().positive(),
  subject: z.string().max(MAX_SUBJECT_CHARS, "Subject is too long."),
  body: z.string().trim().min(1, "The content cannot be empty.").max(MAX_BODY_CHARS, "The content is too long."),
});

export const submitSchema = z.object({
  id: z.number().int().positive(),
  expectedVersion: z.number().int().positive(),
});

export const reviewSchema = z
  .object({
    id: z.number().int().positive(),
    expectedVersion: z.number().int().positive(),
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
    decision: z.enum(REVIEW_DECISIONS),
    notes: z.string().trim().max(MAX_NOTES_CHARS, "Notes are too long.").default(""),
  })
  .refine((v) => v.decision === "approve" || v.notes.length > 0, {
    message: "Add a note explaining what needs to change.",
    path: ["notes"],
  });

/** SHA-256 of exactly what a reviewer reads. Not used for passwords or secrets. */
export function contentHash(subject: string, body: string): string {
  return createHash("sha256").update(JSON.stringify([subject, body])).digest("hex");
}

export interface Actor {
  id: string;
  role: Role;
}

export interface ItemState {
  status: ApprovalStatus;
  version: number;
  contentHash: string;
  createdById: string | null;
}

type Plan = { ok: true; toStatus: ApprovalStatus; invalidatesApproval: boolean } | { ok: false; error: string };

const fail = (error: string): Plan => ({ ok: false, error });
const STALE = "This content changed since you opened it. Reload to see the latest version.";

const isOwnerOrAdmin = (item: ItemState, actor: Actor) => actor.role === "admin" || item.createdById === actor.id;

export function planEdit(item: ItemState, actor: Actor, expectedVersion: number): Plan {
  if (!canAuthor(actor.role)) return fail("You don't have permission to edit this.");
  if (!isOwnerOrAdmin(item, actor)) return fail("Only the author or an admin can edit this.");
  if (item.status === "rejected") return fail("Rejected content is read-only.");
  if (item.version !== expectedVersion) return fail(STALE);
  const resets = item.status === "approved" || item.status === "pending_approval";
  return { ok: true, toStatus: resets ? "draft" : item.status, invalidatesApproval: item.status === "approved" };
}

export function planSubmit(item: ItemState, actor: Actor, expectedVersion: number): Plan {
  if (!canAuthor(actor.role)) return fail("You don't have permission to submit this.");
  if (!isOwnerOrAdmin(item, actor)) return fail("Only the author or an admin can submit this.");
  if (item.version !== expectedVersion) return fail(STALE);
  if (item.status === "pending_approval") return fail("This is already waiting for approval.");
  if (item.status !== "draft" && item.status !== "changes_requested") return fail(`${STATUS_LABELS[item.status]} content cannot be submitted.`);
  return { ok: true, toStatus: "pending_approval", invalidatesApproval: false };
}

export function planReview(item: ItemState, actor: Actor, decision: ReviewDecision, expectedVersion: number, expectedHash: string): Plan {
  if (!canReview(actor.role)) return fail("Only an admin can review AI-generated content.");
  if (item.createdById === actor.id) return fail("You can't review content you created. Ask another admin.");
  if (item.status !== "pending_approval") {
    return fail(item.status === "approved" ? "This was already approved." : `This is ${STATUS_LABELS[item.status].toLowerCase()}, not waiting for approval.`);
  }
  if (item.version !== expectedVersion || item.contentHash !== expectedHash) return fail(STALE);
  return { ok: true, toStatus: DECISION_TO_STATUS[decision], invalidatesApproval: false };
}

/** Funders the app created for demos/samples. Never offer to contact them. */
export function isSyntheticFunder(name: string): boolean {
  return /^\s*\[DEMO\]/i.test(name) || /^\s*Sample\s/.test(name);
}

export interface EmailGateInput {
  status: ApprovalStatus;
  version: number;
  contentHash: string;
  approvedVersion: number | null;
  approvedHash: string | null;
  funderName: string;
}

/**
 * The only path to an external action: approved, unchanged since approval, and a real funder.
 * Even then the person must confirm, and the app only opens their own email client (no auto-send).
 */
export function emailBlockedReason(i: EmailGateInput): string | null {
  if (isSyntheticFunder(i.funderName)) return "This is a demo or sample funder. Messages are never sent to synthetic funders.";
  if (i.status !== "approved") return "Only approved content can be opened in email.";
  if (i.approvedVersion !== i.version || i.approvedHash !== i.contentHash) return "The content changed after approval. Submit it for approval again.";
  return null;
}
