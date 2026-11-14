/**
 * Read-only queries for the Reports page. Existing tables and columns only:
 * pipeline_items, payments, opportunities, funders (organization name and type). Never the people table.
 */
import { asc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import type { ReportItem, ReportOpenCall, ReportPayment } from "./reports-model";

export interface ReportData {
  /** YYYY-MM-DD, read at request time. */
  today: string;
  items: ReportItem[];
  payments: ReportPayment[];
  /** Opportunities with is_open = 'open'. */
  openCalls: ReportOpenCall[];
}

export async function reportData(): Promise<ReportData> {
  await connection();
  // Read the clock only after connection() so Cache Components treats this as request-time.
  const today = new Date().toISOString().slice(0, 10);

  const [rows, paymentRows, openRows] = await Promise.all([
    db
      .select({ p: schema.pipelineItems, f: schema.funders, o: schema.opportunities })
      .from(schema.pipelineItems)
      .innerJoin(schema.funders, eq(schema.pipelineItems.funderId, schema.funders.id))
      .leftJoin(schema.opportunities, eq(schema.pipelineItems.opportunityId, schema.opportunities.id))
      .orderBy(asc(schema.pipelineItems.createdAt)),
    db
      .select({ pipelineItemId: schema.payments.pipelineItemId, amount: schema.payments.amount, receivedOn: schema.payments.receivedOn })
      .from(schema.payments),
    db
      .select({ o: schema.opportunities, name: schema.funders.name })
      .from(schema.opportunities)
      .innerJoin(schema.funders, eq(schema.opportunities.funderId, schema.funders.id))
      .where(eq(schema.opportunities.isOpen, "open")),
  ]);

  const receivedBy = new Map<number, number>();
  for (const p of paymentRows) receivedBy.set(p.pipelineItemId, (receivedBy.get(p.pipelineItemId) ?? 0) + p.amount);

  return {
    today,
    items: rows.map(({ p, f, o }) => ({
      id: p.id,
      funderId: f.id,
      funderName: f.name,
      funderType: f.type,
      stage: p.stage,
      amountAsked: p.amountAsked,
      amountAwarded: p.amountAwarded,
      deadline: p.deadline,
      awardedOn: p.awardedOn,
      isSample: p.isSample,
      opportunityId: p.opportunityId,
      opportunityTitle: o?.title ?? null,
      opportunityDeadline: o?.deadline ?? null,
      route: o?.route ?? null,
      received: receivedBy.get(p.id) ?? 0,
    })),
    payments: paymentRows,
    openCalls: openRows.map(({ o, name }) => ({ id: o.id, funderName: name, title: o.title, deadline: o.deadline, route: o.route, awardMin: o.awardMin, awardMax: o.awardMax })),
  };
}
