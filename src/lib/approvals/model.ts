/**
 * Human approval of AI-generated content: pure rules (no DB), shared by server actions and tests.
 *
 *   draft ──submit──▶ pending_approval ──approve──▶ approved
 *     ▲                     │  ├──request_changes──▶ changes_requested ──resubmit──▶ pending_approval
 *     │                     │  └──reject──▶ rejected
 *     └──invalidate (material edit of pending/approved content)
 *
 * Approval never sends anything. Sending stays a separate, explicit human step.
 */
import { createHash } from "node:crypto";

export const REVIEW_STATUSES = ["draft", "pending_approval", "approved", "changes_requested", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_ACTIONS = ["submit", "approve", "request_changes", "reject", "reviewer_edit", "invalidate"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  changes_requested: "Changes requested",
  rejected: "Rejected",
};

export const ACTION_LABEL: Record<ReviewAction, string> = {
  submit: "Submitted for approval",
  approve: "Approved",
  request_changes: "Requested changes",
  reject: "Rejected",
  reviewer_edit: "Edited by reviewer",
  invalidate: "Approval cleared after edit",
};

export const CONTENT_TYPE_LABEL: Record<string, string> = {
  grant_draft: "Grant proposal draft",
  outreach: "Funder outreach",
  pipeline: "Pipeline outreach / LOI",
};

export const MAX_NOTE_CHARS = 2_000;
export const MAX_BODY_CHARS = 20_000;

/** Which actions move which status where. Anything not listed is refused. */
const TRANSITIONS: Record<ReviewAction, Partial<Record<ReviewStatus, ReviewStatus>>> = {
  submit: { draft: "pending_approval", changes_requested: "pending_approval" },
  approve: { pending_approval: "approved" },
  request_changes: { pending_approval: "changes_requested" },
  reject: { pending_approval: "rejected" },
  reviewer_edit: { pending_approval: "pending_approval" },
  invalidate: { pending_approval: "draft", approved: "draft" },
};

export function nextStatus(action: ReviewAction, from: ReviewStatus): ReviewStatus | null {
  return TRANSITIONS[action][from] ?? null;
}

/** Statuses from which `action` is allowed (used for race-safe conditional UPDATEs). */
export function allowedFrom(action: ReviewAction): ReviewStatus[] {
  return Object.keys(TRANSITIONS[action]) as ReviewStatus[];
}

/** Which permission each action needs (see src/lib/auth/roles.ts). */
export const ACTION_PERMISSION = {
  submit: "review:submit",
  approve: "review:decide",
  request_changes: "review:decide",
  reject: "review:decide",
  reviewer_edit: "review:edit-as-reviewer",
  invalidate: "draft:edit",
} as const satisfies Record<ReviewAction, string>;

/** Rejecting or requesting changes must say why, so the author knows what to fix. */
export function noteRequired(action: ReviewAction): boolean {
  return action === "request_changes" || action === "reject";
}

/**
 * Fingerprint of the content. Whitespace-only edits are not "material", so they keep an approval;
 * any change to words, numbers or punctuation produces a new hash and clears it.
 */
export function contentHash(body: string): string {
  const normalised = body.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  return createHash("sha256").update(normalised, "utf8").digest("hex");
}

export function isMaterialChange(before: string, after: string): boolean {
  return contentHash(before) !== contentHash(after);
}

/** Only approved content whose hash still matches what the reviewer saw may leave the building. */
export function canSend(status: ReviewStatus | null | undefined, approvedHash: string | null | undefined, currentBody: string): boolean {
  return status === "approved" && !!approvedHash && approvedHash === contentHash(currentBody);
}

/** Content type from the `kind` each existing draft flow stores in drafts.source_material (grant drafts have none). */
export function contentTypeOf(sourceMaterial: unknown): "grant_draft" | "outreach" | "pipeline" {
  const kind = sourceMaterial && typeof sourceMaterial === "object" ? (sourceMaterial as { kind?: unknown }).kind : null;
  return kind === "outreach" || kind === "pipeline" ? kind : "grant_draft";
}

export function titleFor(contentType: string, funderName: string, sourceMaterial: unknown): string {
  const subject = sourceMaterial && typeof sourceMaterial === "object" ? (sourceMaterial as { subject?: unknown }).subject : null;
  if ((contentType === "outreach" || contentType === "pipeline") && typeof subject === "string" && subject.trim()) return `${subject.trim().slice(0, 120)} — ${funderName}`;
  return `${CONTENT_TYPE_LABEL[contentType] ?? "Draft"} — ${funderName}`;
}

export function isReviewStatus(v: unknown): v is ReviewStatus {
  return typeof v === "string" && (REVIEW_STATUSES as readonly string[]).includes(v);
}
