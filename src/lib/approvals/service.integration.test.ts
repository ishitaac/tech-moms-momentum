/**
 * Runs the approval service against a real Postgres. Skipped unless TEST_DATABASE_URL is set
 * (point it at a local/dev database that has the schema pushed — never production).
 * It creates its own users and drafts and deletes only those rows afterwards.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("approval service (database)", () => {
  type Svc = typeof import("./service");
  type Db = typeof import("@/db");
  let svc: Svc;
  let dbm: Db;
  const admin = { id: `test-admin-${randomUUID()}`, rawRole: "admin" };
  const staff = { id: `test-staff-${randomUUID()}`, rawRole: "staff" };
  const draftIds: number[] = [];
  let funderId: number;

  async function newDraft(body: string) {
    const [d] = await dbm.db.insert(dbm.schema.drafts).values({ funderId, body, sourceMaterial: { kind: "outreach", subject: "Test subject" }, createdBy: staff.id }).returning({ id: dbm.schema.drafts.id });
    draftIds.push(d.id);
    return d.id;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    dbm = await import("@/db");
    svc = await import("./service");
    const { authUsers, funders } = dbm.schema;
    await dbm.db.insert(authUsers).values([
      { id: admin.id, name: "Test Admin", email: `${admin.id}@example.test`, role: "admin" },
      { id: staff.id, name: "Test Staff", email: `${staff.id}@example.test`, role: "staff" },
    ]);
    const [f] = await dbm.db.insert(funders).values({ name: `Approval Test Funder ${randomUUID()}`, type: "foundation" }).returning({ id: funders.id });
    funderId = f.id;
  });

  afterAll(async () => {
    if (!dbm) return;
    const { eq, inArray } = await import("drizzle-orm");
    const { drafts, funders, authUsers } = dbm.schema;
    if (draftIds.length) await dbm.db.delete(drafts).where(inArray(drafts.id, draftIds)); // cascades to reviews + events
    if (funderId) await dbm.db.delete(funders).where(eq(funders.id, funderId));
    await dbm.db.delete(authUsers).where(inArray(authUsers.id, [admin.id, staff.id]));
  });

  it("submit → approve, with history", async () => {
    const draftId = await newDraft("Dear funder, we ask $5,000.");
    const sub = await svc.submitForApproval(staff, draftId);
    expect(sub.ok).toBe(true);
    if (!sub.ok) return;
    const detail = await svc.reviewDetail(sub.data.reviewId);
    expect(detail?.review.status).toBe("pending_approval");

    const r = await svc.decide(admin, sub.data.reviewId, "approve", detail!.currentHash, "ok");
    expect(r).toEqual({ ok: true, data: { status: "approved" } });
    const after = await svc.reviewDetail(sub.data.reviewId);
    expect(after?.review.reviewedBy).toBe(admin.id);
    expect(after?.history.map((h) => h.action)).toEqual(["approve", "submit"]);
  });

  it("prevents duplicate approval requests", async () => {
    const draftId = await newDraft("Body A");
    expect((await svc.submitForApproval(staff, draftId)).ok).toBe(true);
    const again = await svc.submitForApproval(staff, draftId);
    expect(again.ok).toBe(false);
  });

  it("prevents unauthorized approval by staff", async () => {
    const draftId = await newDraft("Body B");
    const sub = await svc.submitForApproval(staff, draftId);
    if (!sub.ok) throw new Error(sub.error);
    const d = await svc.reviewDetail(sub.data.reviewId);
    const r = await svc.decide(staff, sub.data.reviewId, "approve", d!.currentHash, null);
    expect(r.ok).toBe(false);
    expect((await svc.reviewDetail(sub.data.reviewId))?.review.status).toBe("pending_approval");
  });

  it("refuses a stale approval when the content changed after review started", async () => {
    const draftId = await newDraft("Original text");
    const sub = await svc.submitForApproval(staff, draftId);
    if (!sub.ok) throw new Error(sub.error);
    const seen = (await svc.reviewDetail(sub.data.reviewId))!.currentHash;
    const { eq } = await import("drizzle-orm");
    await dbm.db.update(dbm.schema.drafts).set({ body: "Changed text" }).where(eq(dbm.schema.drafts.id, draftId));
    const r = await svc.decide(admin, sub.data.reviewId, "approve", seen, null);
    expect(r.ok).toBe(false);
  });

  it("request changes needs a note; author edits and resubmits; then reject", async () => {
    const draftId = await newDraft("Needs work");
    const sub = await svc.submitForApproval(staff, draftId);
    if (!sub.ok) throw new Error(sub.error);
    const id = sub.data.reviewId;
    let h = (await svc.reviewDetail(id))!.currentHash;
    expect((await svc.decide(admin, id, "request_changes", h, "  ")).ok).toBe(false);
    expect((await svc.decide(admin, id, "request_changes", h, "Fix the amount")).ok).toBe(true);

    expect((await svc.editReviewedContent(staff, id, "Fixed text", h)).ok).toBe(true);
    expect((await svc.submitForApproval(staff, draftId)).ok).toBe(true);
    h = (await svc.reviewDetail(id))!.currentHash;
    expect((await svc.decide(admin, id, "reject", h, "Not a fit")).ok).toBe(true);
    // Rejected is final
    expect((await svc.submitForApproval(staff, draftId)).ok).toBe(false);
    const actions = (await svc.reviewDetail(id))!.history.map((x) => x.action);
    expect(actions).toEqual(["reject", "submit", "request_changes", "submit"]);
  });

  it("a material edit of approved content clears the approval and blocks sending", async () => {
    const { canSend } = await import("./model");
    const draftId = await newDraft("Approved body");
    const sub = await svc.submitForApproval(staff, draftId);
    if (!sub.ok) throw new Error(sub.error);
    const h = (await svc.reviewDetail(sub.data.reviewId))!.currentHash;
    await svc.decide(admin, sub.data.reviewId, "approve", h, null);
    let a = await svc.approvalForDraft(draftId);
    expect(canSend(a?.status, a?.contentHash, "Approved body")).toBe(true);

    await svc.onDraftBodyChanged(draftId, "Approved body  ", staff.id); // whitespace only: keeps approval
    expect((await svc.approvalForDraft(draftId))?.status).toBe("approved");

    await svc.onDraftBodyChanged(draftId, "Approved body, now asking for more", staff.id);
    a = await svc.approvalForDraft(draftId);
    expect(a?.status).toBe("draft");
    expect(canSend(a?.status, a?.contentHash, "Approved body, now asking for more")).toBe(false);
  });

  it("staff cannot edit content while it is pending (only a reviewer can)", async () => {
    const draftId = await newDraft("Pending body");
    const sub = await svc.submitForApproval(staff, draftId);
    if (!sub.ok) throw new Error(sub.error);
    const h = (await svc.reviewDetail(sub.data.reviewId))!.currentHash;
    expect((await svc.editReviewedContent(staff, sub.data.reviewId, "sneaky", h)).ok).toBe(false);
    const r = await svc.editReviewedContent(admin, sub.data.reviewId, "Reviewer fix", h);
    expect(r.ok).toBe(true);
    expect((await svc.reviewDetail(sub.data.reviewId))?.review.status).toBe("pending_approval");
  });
});
