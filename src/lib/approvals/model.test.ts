import { describe, expect, it } from "vitest";
import {
  contentHash,
  emailBlockedReason,
  isSyntheticFunder,
  planEdit,
  planReview,
  planSubmit,
  reviewSchema,
  type ApprovalStatus,
  type ItemState,
} from "./model";

const staff = { id: "u-staff", role: "staff" as const };
const otherStaff = { id: "u-staff-2", role: "staff" as const };
const admin = { id: "u-admin", role: "admin" as const };
const admin2 = { id: "u-admin-2", role: "admin" as const };

const HASH = contentHash("Subject", "Body");
const item = (status: ApprovalStatus, over: Partial<ItemState> = {}): ItemState => ({
  status,
  version: 3,
  contentHash: HASH,
  createdById: staff.id,
  ...over,
});

describe("contentHash", () => {
  it("is stable and changes when subject or body changes", () => {
    expect(contentHash("Subject", "Body")).toBe(HASH);
    expect(HASH).toMatch(/^[a-f0-9]{64}$/);
    expect(contentHash("Subject", "Body!")).not.toBe(HASH);
    expect(contentHash("Subject!", "Body")).not.toBe(HASH);
    // Field boundary matters: ("ab","c") ≠ ("a","bc")
    expect(contentHash("ab", "c")).not.toBe(contentHash("a", "bc"));
  });
});

describe("planSubmit", () => {
  it("moves a draft or changes-requested item to pending", () => {
    expect(planSubmit(item("draft"), staff, 3)).toMatchObject({ ok: true, toStatus: "pending_approval" });
    expect(planSubmit(item("changes_requested"), staff, 3)).toMatchObject({ ok: true, toStatus: "pending_approval" });
  });
  it("lets an admin submit someone else's draft", () => {
    expect(planSubmit(item("draft"), admin, 3).ok).toBe(true);
  });
  it("refuses another staff member's draft", () => {
    expect(planSubmit(item("draft"), otherStaff, 3).ok).toBe(false);
  });
  it("prevents duplicate submissions and submitting final states", () => {
    expect(planSubmit(item("pending_approval"), staff, 3)).toMatchObject({ ok: false, error: expect.stringMatching(/already/) });
    expect(planSubmit(item("approved"), staff, 3).ok).toBe(false);
    expect(planSubmit(item("rejected"), staff, 3).ok).toBe(false);
  });
  it("refuses a stale version", () => {
    expect(planSubmit(item("draft"), staff, 2).ok).toBe(false);
  });
});

describe("planReview", () => {
  it("lets a different admin approve, request changes or reject pending content", () => {
    expect(planReview(item("pending_approval"), admin, "approve", 3, HASH)).toMatchObject({ ok: true, toStatus: "approved" });
    expect(planReview(item("pending_approval"), admin, "request_changes", 3, HASH)).toMatchObject({ ok: true, toStatus: "changes_requested" });
    expect(planReview(item("pending_approval"), admin, "reject", 3, HASH)).toMatchObject({ ok: true, toStatus: "rejected" });
  });
  it("refuses staff reviewers", () => {
    expect(planReview(item("pending_approval", { createdById: admin.id }), staff, "approve", 3, HASH)).toMatchObject({ ok: false });
  });
  it("refuses self-review, even by an admin", () => {
    expect(planReview(item("pending_approval", { createdById: admin.id }), admin, "approve", 3, HASH).ok).toBe(false);
    expect(planReview(item("pending_approval", { createdById: admin.id }), admin2, "approve", 3, HASH).ok).toBe(true);
  });
  it("prevents duplicate approvals", () => {
    expect(planReview(item("approved"), admin, "approve", 3, HASH)).toMatchObject({ ok: false, error: "This was already approved." });
  });
  it("only reviews pending content", () => {
    for (const s of ["draft", "changes_requested", "rejected"] as const) {
      expect(planReview(item(s), admin, "approve", 3, HASH).ok).toBe(false);
    }
  });
  it("refuses stale approvals (version or text changed since the reviewer opened it)", () => {
    expect(planReview(item("pending_approval"), admin, "approve", 2, HASH).ok).toBe(false);
    expect(planReview(item("pending_approval"), admin, "approve", 3, contentHash("Subject", "edited")).ok).toBe(false);
  });
});

describe("planEdit", () => {
  it("editing approved content invalidates the approval and returns it to draft", () => {
    expect(planEdit(item("approved"), staff, 3)).toEqual({ ok: true, toStatus: "draft", invalidatesApproval: true });
  });
  it("editing pending content pulls it back to draft", () => {
    expect(planEdit(item("pending_approval"), staff, 3)).toEqual({ ok: true, toStatus: "draft", invalidatesApproval: false });
  });
  it("keeps draft / changes-requested status on edit", () => {
    expect(planEdit(item("draft"), staff, 3)).toMatchObject({ ok: true, toStatus: "draft" });
    expect(planEdit(item("changes_requested"), staff, 3)).toMatchObject({ ok: true, toStatus: "changes_requested" });
  });
  it("rejected content is read-only", () => {
    expect(planEdit(item("rejected"), admin, 3).ok).toBe(false);
  });
  it("only the author or an admin can edit; versions must match", () => {
    expect(planEdit(item("draft"), otherStaff, 3).ok).toBe(false);
    expect(planEdit(item("draft"), admin, 3).ok).toBe(true);
    expect(planEdit(item("draft"), staff, 4).ok).toBe(false);
  });
});

describe("reviewSchema", () => {
  const base = { id: 1, expectedVersion: 1, expectedHash: HASH };
  it("requires notes when requesting changes or rejecting", () => {
    expect(reviewSchema.safeParse({ ...base, decision: "reject", notes: "  " }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...base, decision: "request_changes" }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...base, decision: "reject", notes: "Off-mission" }).success).toBe(true);
  });
  it("allows approval without notes; rejects malformed hashes and unknown decisions", () => {
    expect(reviewSchema.safeParse({ ...base, decision: "approve" }).success).toBe(true);
    expect(reviewSchema.safeParse({ ...base, decision: "approve", expectedHash: "x" }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...base, decision: "send" }).success).toBe(false);
  });
});

describe("external send gate", () => {
  const ok = { status: "approved" as const, version: 3, contentHash: HASH, approvedVersion: 3, approvedHash: HASH, funderName: "Real Foundation" };
  it("allows only approved, unchanged content for a real funder", () => {
    expect(emailBlockedReason(ok)).toBeNull();
    expect(emailBlockedReason({ ...ok, status: "pending_approval" })).not.toBeNull();
    expect(emailBlockedReason({ ...ok, approvedHash: contentHash("x", "y") })).not.toBeNull();
    expect(emailBlockedReason({ ...ok, approvedVersion: 2 })).not.toBeNull();
  });
  it("never allows synthetic (demo/sample) funders", () => {
    expect(isSyntheticFunder("[DEMO] Wasatch Women in Tech Fund")).toBe(true);
    expect(isSyntheticFunder("Sample Utah Workforce Grant")).toBe(true);
    expect(isSyntheticFunder("Sorenson Legacy Foundation")).toBe(false);
    expect(emailBlockedReason({ ...ok, funderName: "[DEMO] Mountain West Career Pathways Foundation" })).toMatch(/synthetic/);
  });
});
