/** Upserts opportunities from a source adapter, creating the funder (agency/foundation) if needed. */
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Opportunity } from "@/lib/sources/types";

export interface SaveResult {
  inserted: number;
  updated: number;
  newOpenCallIds: number[];
}

async function funderIdFor(o: Opportunity): Promise<number> {
  const [existing] = await db
    .select({ id: schema.funders.id })
    .from(schema.funders)
    .where(and(eq(schema.funders.name, o.funderName), eq(schema.funders.type, o.funderType)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(schema.funders)
    .values({ name: o.funderName, type: o.funderType, website: o.website, state: o.funderType === "state" ? "UT" : null })
    .returning({ id: schema.funders.id });
  return created.id;
}

export async function saveOpportunities(items: Opportunity[]): Promise<SaveResult> {
  const result: SaveResult = { inserted: 0, updated: 0, newOpenCallIds: [] };
  for (const o of items) {
    const funderId = await funderIdFor(o);
    const values = {
      funderId,
      externalId: o.externalId,
      title: o.title,
      sourceUrl: o.sourceUrl,
      isOpen: o.isOpen,
      deadline: o.deadline,
      route: o.route,
      awardMin: o.awardMin,
      awardMax: o.awardMax,
      eligibility: o.eligibility,
      geography: o.geography,
      description: o.description,
      checkedAt: new Date(),
    };
    const [existing] = await db
      .select({ id: schema.opportunities.id, isOpen: schema.opportunities.isOpen })
      .from(schema.opportunities)
      .where(eq(schema.opportunities.externalId, o.externalId))
      .limit(1);
    if (existing) {
      await db.update(schema.opportunities).set(values).where(eq(schema.opportunities.id, existing.id));
      result.updated++;
      if (existing.isOpen !== "open" && o.isOpen === "open") result.newOpenCallIds.push(existing.id);
    } else {
      const [row] = await db.insert(schema.opportunities).values(values).returning({ id: schema.opportunities.id });
      result.inserted++;
      if (o.isOpen === "open") result.newOpenCallIds.push(row.id);
    }
  }
  return result;
}
