/** Read-side queries for the Approvals pages. Callers must have checked the session first. */
import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { APPROVAL_STATUSES, type ApprovalStatus } from "./model";

const creator = alias(schema.authUsers, "creator");
const reviewer = alias(schema.authUsers, "reviewer");
const actor = alias(schema.authUsers, "actor");
const a = schema.contentApprovals;

export async function pendingApprovalCount(): Promise<number> {
  await connection();
  const [r] = await db.select({ n: count() }).from(a).where(eq(a.status, "pending_approval"));
  return r?.n ?? 0;
}

export interface ApprovalRow {
  id: number;
  title: string;
  contentType: string;
  status: ApprovalStatus;
  funderId: number;
  funderName: string;
  creatorName: string | null;
  reviewerName: string | null;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  createdById: string | null;
}

export function parseStatusFilter(raw: unknown): ApprovalStatus | null {
  return typeof raw === "string" && (APPROVAL_STATUSES as readonly string[]).includes(raw) ? (raw as ApprovalStatus) : null;
}

export async function listApprovals(status: ApprovalStatus | null): Promise<ApprovalRow[]> {
  await connection();
  const where: SQL[] = [];
  if (status) where.push(eq(a.status, status));
  return db
    .select({
      id: a.id,
      title: a.title,
      contentType: a.contentType,
      status: a.status,
      funderId: a.funderId,
      funderName: schema.funders.name,
      creatorName: creator.name,
      reviewerName: reviewer.name,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      submittedAt: a.submittedAt,
      reviewedAt: a.reviewedAt,
      createdById: a.createdById,
    })
    .from(a)
    .innerJoin(schema.funders, eq(a.funderId, schema.funders.id))
    .leftJoin(creator, eq(a.createdById, creator.id))
    .leftJoin(reviewer, eq(a.reviewedById, reviewer.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(a.updatedAt))
    .limit(200);
}

export async function statusCounts(): Promise<Record<ApprovalStatus, number>> {
  await connection();
  const rows = await db.select({ status: a.status, n: count() }).from(a).groupBy(a.status);
  const out = Object.fromEntries(APPROVAL_STATUSES.map((s) => [s, 0])) as Record<ApprovalStatus, number>;
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export interface ApprovalEventRow {
  id: number;
  action: string;
  fromStatus: ApprovalStatus | null;
  toStatus: ApprovalStatus | null;
  actorName: string | null;
  notes: string | null;
  version: number;
  contentHash: string;
  createdAt: Date;
}

export interface ApprovalDetail extends ApprovalRow {
  subject: string;
  body: string;
  sourceMaterial: string[];
  factsToVerify: string[];
  version: number;
  contentHash: string;
  approvedHash: string | null;
  approvedVersion: number | null;
  reviewNotes: string | null;
  draftId: number | null;
  requestInput: { purpose?: string; amount?: string; notes?: string } | null;
  events: ApprovalEventRow[];
}

export async function approvalDetail(id: number): Promise<ApprovalDetail | null> {
  await connection();
  const [row] = await db
    .select({
      id: a.id,
      title: a.title,
      contentType: a.contentType,
      status: a.status,
      funderId: a.funderId,
      funderName: schema.funders.name,
      creatorName: creator.name,
      reviewerName: reviewer.name,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      submittedAt: a.submittedAt,
      reviewedAt: a.reviewedAt,
      createdById: a.createdById,
      subject: a.subject,
      body: a.body,
      sourceMaterial: a.sourceMaterial,
      factsToVerify: a.factsToVerify,
      version: a.version,
      contentHash: a.contentHash,
      approvedHash: a.approvedHash,
      approvedVersion: a.approvedVersion,
      reviewNotes: a.reviewNotes,
      draftId: a.draftId,
      draftMaterial: schema.drafts.sourceMaterial,
    })
    .from(a)
    .innerJoin(schema.funders, eq(a.funderId, schema.funders.id))
    .leftJoin(creator, eq(a.createdById, creator.id))
    .leftJoin(reviewer, eq(a.reviewedById, reviewer.id))
    .leftJoin(schema.drafts, eq(a.draftId, schema.drafts.id))
    .where(eq(a.id, id));
  if (!row) return null;

  const events = await db
    .select({
      id: schema.approvalEvents.id,
      action: schema.approvalEvents.action,
      fromStatus: schema.approvalEvents.fromStatus,
      toStatus: schema.approvalEvents.toStatus,
      actorName: actor.name,
      notes: schema.approvalEvents.notes,
      version: schema.approvalEvents.version,
      contentHash: schema.approvalEvents.contentHash,
      createdAt: schema.approvalEvents.createdAt,
    })
    .from(schema.approvalEvents)
    .leftJoin(actor, eq(schema.approvalEvents.actorId, actor.id))
    .where(eq(schema.approvalEvents.approvalId, id))
    .orderBy(desc(schema.approvalEvents.id));

  const { draftMaterial, ...rest } = row;
  const input = (draftMaterial as { input?: ApprovalDetail["requestInput"] } | null)?.input ?? null;
  return { ...rest, requestInput: input, events };
}

export interface UnsubmittedDraft {
  draftId: number;
  funderId: number;
  funderName: string;
  contentType: string;
  subject: string;
  preview: string;
  updatedAt: Date;
}

/** Latest saved AI draft per funder that has no approval item yet (so saved drafts can enter review). */
export async function unsubmittedDrafts(): Promise<UnsubmittedDraft[]> {
  await connection();
  const rows = await db.execute<{ draft_id: number; funder_id: number; funder_name: string; material: Record<string, unknown> | null; body: string; updated_at: Date | string }>(sql`
    select distinct on (d.funder_id) d.id as draft_id, d.funder_id, f.name as funder_name, d.source_material as material, d.body, d.updated_at
    from drafts d
    join funders f on f.id = d.funder_id
    where not exists (select 1 from content_approvals ca where ca.funder_id = d.funder_id and ca.draft_id >= d.id)
    order by d.funder_id, d.id desc
    limit 50`);
  return rows
    .map((r) => {
      const m = r.material ?? {};
      return {
        draftId: r.draft_id,
        funderId: r.funder_id,
        funderName: r.funder_name,
        contentType: m.kind === "outreach" && typeof m.draftType === "string" ? m.draftType : "grant_draft",
        subject: typeof m.subject === "string" ? m.subject : "",
        preview: r.body.slice(0, 160),
        updatedAt: new Date(r.updated_at),
      };
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
