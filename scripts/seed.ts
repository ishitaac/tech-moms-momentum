/**
 * Seeds settings, the corporate funders Robbyn named (PRD interview), and SAMPLE pipeline
 * data so the board and dashboard are never empty. Sample rows are flagged is_sample and
 * shown with a "Sample" badge. Safe to re-run.
 *
 * Usage: npm run db:seed
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";

const CORPORATE_SEEDS = [
  { name: "Adobe", website: "https://www.adobe.com/corporate-responsibility.html" },
  { name: "Meta", website: "https://about.meta.com/community/" },
  { name: "Weave", website: "https://www.getweave.com/" },
  { name: "Ancestry", website: "https://www.ancestry.com/corporate/" },
] as const;

/** Sample pipeline: [seed index, stage, asked, awarded, payments [amount, yyyy-mm-dd][]]. */
const SAMPLE_PIPELINE: [number, typeof schema.stage.enumValues[number], number, number | null, [number, string][]][] = [
  [0, "awarded", 25_000, 25_000, [[12_500, "2026-07-15"], [12_500, "2026-10-15"]]],
  [1, "awarded", 30_000, 20_000, [[20_000, "2026-09-01"]]],
  [2, "submitted", 10_000, null, []],
  [3, "loi", 15_000, null, []],
];

async function upsertSeedFunder(name: string, website: string): Promise<number> {
  const [existing] = await db.select({ id: schema.funders.id }).from(schema.funders).where(eq(schema.funders.name, name)).limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(schema.funders)
    .values({ name, website, type: "corporate", isSeed: true })
    .returning({ id: schema.funders.id });
  return row.id;
}

async function main() {
  await db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing();

  const seedIds: number[] = [];
  for (const s of CORPORATE_SEEDS) seedIds.push(await upsertSeedFunder(s.name, s.website));
  console.log(`Corporate seeds: ${seedIds.length}`);

  await db.delete(schema.pipelineItems).where(eq(schema.pipelineItems.isSample, true));
  for (const [idx, stage, asked, awarded, pays] of SAMPLE_PIPELINE) {
    const [item] = await db
      .insert(schema.pipelineItems)
      .values({
        funderId: seedIds[idx],
        stage,
        amountAsked: asked,
        amountAwarded: awarded,
        awardedOn: awarded ? (pays[0]?.[1] ?? null) : null,
        isSample: true,
        notes: "Sample data for the demo",
      })
      .returning({ id: schema.pipelineItems.id });
    for (const [amount, receivedOn] of pays) {
      await db.insert(schema.payments).values({ pipelineItemId: item.id, amount, receivedOn });
    }
  }
  console.log(`Sample pipeline items: ${SAMPLE_PIPELINE.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
