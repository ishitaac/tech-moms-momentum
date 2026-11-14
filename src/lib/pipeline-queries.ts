/** Read-side queries for the pipeline board and dashboard. */
import { asc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";

import type { PaymentRow, PipelineCard } from "./pipeline-model";

export * from "./pipeline-model";

export async function pipelineCards(): Promise<(PipelineCard & { awardedOn: string | null })[]> {
  await connection();
  const rows = await db
    .select({ p: schema.pipelineItems, f: schema.funders, o: schema.opportunities })
    .from(schema.pipelineItems)
    .innerJoin(schema.funders, eq(schema.pipelineItems.funderId, schema.funders.id))
    .leftJoin(schema.opportunities, eq(schema.pipelineItems.opportunityId, schema.opportunities.id))
    .orderBy(asc(schema.pipelineItems.createdAt));
  const pays = await db.select().from(schema.payments);
  const receivedBy = new Map<number, number>();
  for (const p of pays) receivedBy.set(p.pipelineItemId, (receivedBy.get(p.pipelineItemId) ?? 0) + p.amount);

  return rows.map(({ p, f, o }) => ({
    id: p.id,
    funderId: f.id,
    funderName: f.name,
    funderType: f.type,
    opportunityTitle: o?.title ?? null,
    stage: p.stage,
    awardedOn: p.awardedOn,
    amountAsked: p.amountAsked,
    amountAwarded: p.amountAwarded,
    received: receivedBy.get(p.id) ?? 0,
    deadline: p.deadline ?? o?.deadline ?? null,
    isSample: p.isSample,
    purpose: p.purpose,
    opportunityId: p.opportunityId,
  }));
}

export async function paymentRows(): Promise<PaymentRow[]> {
  await connection();
  const rows = await db
    .select({ pay: schema.payments, p: schema.pipelineItems, f: schema.funders })
    .from(schema.payments)
    .innerJoin(schema.pipelineItems, eq(schema.payments.pipelineItemId, schema.pipelineItems.id))
    .innerJoin(schema.funders, eq(schema.pipelineItems.funderId, schema.funders.id))
    .orderBy(asc(schema.payments.receivedOn));
  return rows.map(({ pay, p, f }) => ({
    pipelineItemId: p.id,
    funderName: f.name,
    funderType: f.type,
    amount: pay.amount,
    receivedOn: pay.receivedOn,
    isSample: p.isSample,
  }));
}

export interface DeadlineRow {
  key: string;
  funderName: string;
  title: string;
  deadline: string;
  kind: "pipeline" | "open call";
  link: string;
}

const DEADLINE_WINDOW_DAYS = 60;

/** Applications and open calls due within the next 60 days (PRD dashboard: upcoming deadlines). */
export async function upcomingDeadlines(asOf?: Date): Promise<DeadlineRow[]> {
  await connection();
  // Read the clock only after connection() so Cache Components treats this as request-time.
  const today = asOf ?? new Date();
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + DEADLINE_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const cards = await pipelineCards();
  const pipelineRows: DeadlineRow[] = cards
    .filter((c) => c.deadline && c.deadline >= from && c.deadline <= to && c.stage !== "awarded" && c.stage !== "declined")
    .map((c) => ({ key: `p${c.id}`, funderName: c.funderName, title: c.opportunityTitle ?? "Application", deadline: c.deadline!, kind: "pipeline", link: "/pipeline" }));
  const opps = await db
    .select({ o: schema.opportunities, name: schema.funders.name })
    .from(schema.opportunities)
    .innerJoin(schema.funders, eq(schema.opportunities.funderId, schema.funders.id))
    .where(eq(schema.opportunities.isOpen, "open"));
  const oppRows: DeadlineRow[] = opps
    .filter(({ o }) => o.deadline && o.deadline >= from && o.deadline <= to)
    .map(({ o, name }) => ({ key: `o${o.id}`, funderName: name, title: o.title, deadline: o.deadline!, kind: "open call", link: o.sourceUrl }));
  return [...pipelineRows, ...oppRows].sort((a, b) => a.deadline.localeCompare(b.deadline));
}
