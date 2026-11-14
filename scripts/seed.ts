/**
 * Seeds settings, the corporate funders Robbyn named (PRD interview), and SAMPLE pipeline
 * data so the board and reports are never empty. Sample rows are flagged is_sample and
 * shown with a "Sample" badge. Safe to re-run: it removes only is_sample pipeline items
 * (and their payments) before re-inserting them, and funders are matched by name.
 * The sample data itself lives in scripts/sample-data.ts.
 *
 * Usage: npm run db:seed
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../src/db";
import { buildSampleRows, CORPORATE_SEEDS, planSampleReset, SAMPLE_FUNDERS } from "./sample-data";

async function upsertSeedFunder(f: { name: string; website: string | null; type: "corporate" | "state" | "federal"; state?: string | null }): Promise<number> {
  const [existing] = await db.select({ id: schema.funders.id }).from(schema.funders).where(eq(schema.funders.name, f.name)).limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(schema.funders)
    .values({ name: f.name, website: f.website, type: f.type, state: f.state ?? null, isSeed: true })
    .returning({ id: schema.funders.id });
  return row.id;
}

async function main() {
  await db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing();

  const idByName = new Map<string, number>();
  for (const s of CORPORATE_SEEDS) idByName.set(s.name, await upsertSeedFunder({ ...s, type: "corporate" }));
  console.log(`Corporate seeds: ${CORPORATE_SEEDS.length}`);
  for (const f of SAMPLE_FUNDERS) idByName.set(f.name, await upsertSeedFunder(f));
  console.log(`Sample funders (state/federal only): ${SAMPLE_FUNDERS.length}`);

  // Remove ONLY sample items (payments cascade). The id list comes from planSampleReset and the delete
  // is also filtered on is_sample, so a real item can never be removed.
  const existing = await db.select({ id: schema.pipelineItems.id, isSample: schema.pipelineItems.isSample }).from(schema.pipelineItems);
  const toDelete = planSampleReset(existing);
  if (toDelete.length) await db.delete(schema.pipelineItems).where(and(inArray(schema.pipelineItems.id, toDelete), eq(schema.pipelineItems.isSample, true)));

  const rows = buildSampleRows(idByName, new Date().toISOString().slice(0, 10));
  for (const { item, payments } of rows) {
    const [inserted] = await db.insert(schema.pipelineItems).values(item).returning({ id: schema.pipelineItems.id });
    for (const p of payments) await db.insert(schema.payments).values({ pipelineItemId: inserted.id, ...p });
  }
  console.log(`Sample pipeline items: ${rows.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
