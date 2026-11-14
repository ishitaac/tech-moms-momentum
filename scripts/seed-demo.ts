/**
 * SYNTHETIC DEMO DATA: two fictional funders with an LOI application route, so the Gemini
 * Outreach Assistant's "Draft LOI starting point" can be shown. The real data has no LOI routes.
 * These are NOT real funders. Names start with "[DEMO]" and links point to example.org.
 *
 * Usage:
 *   npm run db:seed-demo            add (or refresh) the two demo funders, then rescore
 *   npm run db:seed-demo -- remove  delete them, then rescore
 */
import { eq, inArray, like } from "drizzle-orm";
import { db, schema } from "../src/db";
import { scoreAll } from "../src/lib/pipeline/score-all";

const DEMO_PREFIX = "[DEMO]";
const DEMO_NOTE = "SYNTHETIC DEMO DATA — fictional funder for the hackathon demo, not a real organization.";
const DEMO_URL = "https://example.org/demo-only";

const DEMO_FUNDERS = [
  {
    name: `${DEMO_PREFIX} Wasatch Women in Tech Fund`,
    state: "UT",
    city: "Salt Lake City",
    type: "foundation" as const,
    opportunity: {
      title: `${DEMO_PREFIX} Women's Workforce Grants — Letter of Inquiry`,
      deadline: "2027-03-01",
      awardMin: 10_000,
      awardMax: 25_000,
      eligibility: "Demo text: Utah 501(c)(3) organizations supporting women's workforce re-entry. Submit a two-page LOI first.",
    },
  },
  {
    name: `${DEMO_PREFIX} Mountain West Career Pathways Foundation`,
    state: "UT",
    city: "Provo",
    type: "family_foundation" as const,
    opportunity: {
      title: `${DEMO_PREFIX} Career Pathways Program — Letter of Inquiry`,
      deadline: "2027-04-15",
      awardMin: 5_000,
      awardMax: 15_000,
      eligibility: "Demo text: Nonprofits offering technology training for adults changing careers. Invited proposals follow a successful LOI.",
    },
  },
];

async function removeDemo(): Promise<number> {
  const rows = await db.select({ id: schema.funders.id }).from(schema.funders).where(like(schema.funders.name, `${DEMO_PREFIX}%`));
  if (rows.length) await db.delete(schema.funders).where(inArray(schema.funders.id, rows.map((r) => r.id)));
  return rows.length;
}

async function addDemo(): Promise<void> {
  for (const d of DEMO_FUNDERS) {
    const [funder] = await db
      .insert(schema.funders)
      .values({ name: d.name, state: d.state, city: d.city, type: d.type, purpose: DEMO_NOTE, acceptsUnsolicited: true, isSeed: true })
      .returning({ id: schema.funders.id });
    await db.insert(schema.opportunities).values({
      funderId: funder.id,
      title: d.opportunity.title,
      sourceUrl: DEMO_URL,
      isOpen: "open",
      route: "loi",
      deadline: d.opportunity.deadline,
      awardMin: d.opportunity.awardMin,
      awardMax: d.opportunity.awardMax,
      eligibility: d.opportunity.eligibility,
      description: DEMO_NOTE,
    });
  }
}

async function rescore(): Promise<void> {
  const [refresh] = await db.insert(schema.refreshes).values({}).returning({ id: schema.refreshes.id });
  const summary = await scoreAll(refresh.id);
  await db
    .update(schema.refreshes)
    .set({ finishedAt: new Date(), status: "ok", fundersSeen: summary.scored, message: "Rescored after demo seed (no AI)" })
    .where(eq(schema.refreshes.id, refresh.id));
  console.log(`Rescored ${summary.scored} funders → refresh #${refresh.id}`);
}

async function main() {
  const removed = await removeDemo();
  if (process.argv[2] === "remove") {
    console.log(`Removed ${removed} demo funders.`);
  } else {
    await addDemo();
    console.log(`Added ${DEMO_FUNDERS.length} demo funders (search "${DEMO_PREFIX}" in the funder list).`);
  }
  await rescore();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
