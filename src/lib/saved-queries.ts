/** Read-side query for the Saved for Later page. No schema of its own: it reads `decisions`. */
import { format } from "date-fns";
import { and, desc, eq, inArray } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { rankedRows } from "./queries";
import { buildSavedRows, type FunderBasics, type SavedRow } from "./saved-model";

/** Funders whose latest decision is "snooze" (the app's "Save for later"), newest first. */
export async function savedFunders(): Promise<SavedRow[]> {
  await connection();
  const latest = await db
    .selectDistinctOn([schema.decisions.funderId], {
      funderId: schema.decisions.funderId,
      action: schema.decisions.action,
      snoozeUntil: schema.decisions.snoozeUntil,
      createdAt: schema.decisions.createdAt,
    })
    .from(schema.decisions)
    .orderBy(schema.decisions.funderId, desc(schema.decisions.createdAt));
  const saved = latest.filter((d) => d.action === "snooze").map((d) => ({ funderId: d.funderId, savedOn: format(d.createdAt, "yyyy-MM-dd"), snoozeUntil: d.snoozeUntil }));
  if (saved.length === 0) return [];

  const ids = saved.map((s) => s.funderId);
  const [{ rows: ranked }, funderRows, items, opps] = await Promise.all([
    rankedRows(),
    db.select().from(schema.funders).where(inArray(schema.funders.id, ids)),
    db.select({ funderId: schema.pipelineItems.funderId }).from(schema.pipelineItems).where(inArray(schema.pipelineItems.funderId, ids)),
    db.select().from(schema.opportunities).where(and(inArray(schema.opportunities.funderId, ids), eq(schema.opportunities.isOpen, "open"))),
  ]);

  const funders = new Map<number, FunderBasics>(
    funderRows.map((f) => [f.id, { id: f.id, name: f.name, type: f.type, state: f.state, website: f.website, isSeed: f.isSeed }]),
  );
  const openCalls = new Map(opps.map((o) => [o.funderId, { deadline: o.deadline, route: o.route }]));
  return buildSavedRows({ saved, ranked, funders, openCalls, inPipeline: new Set(items.map((i) => i.funderId)) });
}
