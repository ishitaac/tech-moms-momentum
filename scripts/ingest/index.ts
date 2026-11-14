/**
 * Ingest CLI.
 *   npm run ingest -- load        load data/cache/pf-relevant.jsonl into Postgres
 *   npm run ingest -- gov         fetch Grants.gov (+ Utah pages when configured)
 *   npm run ingest -- score       deterministic scoring of everything → scores
 *   npm run ingest -- all         load + gov + score
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../../src/db";
import { scoreAll } from "../../src/lib/pipeline/score-all";
import { saveOpportunities } from "../../src/lib/pipeline/save-opportunities";
import { grantsGovAdapter } from "../../src/lib/sources/grants-gov";
import { load990pf } from "./load-990pf";

async function gov(): Promise<void> {
  const r = await grantsGovAdapter.fetch();
  const saved = await saveOpportunities(r.items);
  console.log(`Grants.gov: ${r.items.length} listings (${saved.inserted} new), ${r.errors.length} errors`);
  for (const e of r.errors) console.warn("  ", e.message);
}

async function score(): Promise<void> {
  const [refresh] = await db.insert(schema.refreshes).values({}).returning({ id: schema.refreshes.id });
  const summary = await scoreAll(refresh.id);
  await db
    .update(schema.refreshes)
    .set({ finishedAt: new Date(), status: "ok", fundersSeen: summary.scored, message: "Scored by CLI (no AI)" })
    .where(eq(schema.refreshes.id, refresh.id));
  console.log(`Scored ${summary.scored} (excluded ${summary.excluded}, shortlisted ${summary.shortlisted}) → refresh #${refresh.id}`);
}

async function main() {
  const cmd = process.argv[2] ?? "all";
  if (cmd === "load" || cmd === "all") console.log(`Loaded ${await load990pf()} foundations`);
  if (cmd === "gov" || cmd === "all") await gov();
  if (cmd === "score" || cmd === "all") await score();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
