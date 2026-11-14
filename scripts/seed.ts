/**
 * Seeds settings, the corporate funders Robbyn named (PRD interview), and SAMPLE pipeline
 * data so the board and dashboard are never empty. Sample rows are flagged is_sample and
 * shown with a "Sample" badge. Safe to re-run.
 *
 * Usage: npm run db:seed
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import type { Purpose, PurposeGoals } from "../src/lib/purposes";

const CORPORATE_SEEDS = [
  { name: "Adobe", website: "https://www.adobe.com/corporate-responsibility.html" },
  { name: "Meta", website: "https://about.meta.com/community/" },
  { name: "Weave", website: "https://www.getweave.com/" },
  { name: "Ancestry", website: "https://www.ancestry.com/corporate/" },
] as const;

/**
 * Sample pipeline: [seed index, stage, asked, awarded, payments [amount, yyyy-mm-dd][], purpose, deadline in N days from today].
 * Some awarded money is still outstanding, and two deadlines fall inside the next 30 days, so the demo shows real-looking numbers.
 */
const SAMPLE_PIPELINE: [number, typeof schema.stage.enumValues[number], number, number | null, [number, string][], Purpose, number | null][] = [
  [0, "awarded", 25_000, 25_000, [[12_500, "2026-07-15"], [6_250, "2026-10-15"]], "technology", null],
  [1, "awarded", 30_000, 20_000, [[10_000, "2026-09-01"]], "scholarships", null],
  [2, "submitted", 10_000, null, [], "childcare", 12],
  [3, "loi", 15_000, null, [], "trainers_tas", 25],
];

const isoInDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** Placeholder annual goals, only written when none exist, and flagged SAMPLE until the user saves their own. */
const SAMPLE_GOALS: PurposeGoals = { trainers_tas: 40_000, scholarships: 60_000, childcare: 30_000, technology: 35_000 };

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
  for (const [idx, stage, asked, awarded, pays, purpose, dueInDays] of SAMPLE_PIPELINE) {
    const [item] = await db
      .insert(schema.pipelineItems)
      .values({
        funderId: seedIds[idx],
        stage,
        amountAsked: asked,
        amountAwarded: awarded,
        awardedOn: awarded ? (pays[0]?.[1] ?? null) : null,
        purpose,
        deadline: dueInDays === null ? null : isoInDays(dueInDays),
        isSample: true,
        notes: "Sample data for the demo",
      })
      .returning({ id: schema.pipelineItems.id });
    for (const [amount, receivedOn] of pays) {
      await db.insert(schema.payments).values({ pipelineItemId: item.id, amount, receivedOn });
    }
  }
  console.log(`Sample pipeline items: ${SAMPLE_PIPELINE.length}`);

  const [settings] = await db.select({ goals: schema.settings.purposeGoals }).from(schema.settings).where(eq(schema.settings.id, 1));
  if (Object.keys(settings?.goals ?? {}).length === 0) {
    await db.update(schema.settings).set({ purposeGoals: SAMPLE_GOALS, purposeGoalsSample: true }).where(eq(schema.settings.id, 1));
    console.log("Sample funding goals written (flagged SAMPLE).");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
