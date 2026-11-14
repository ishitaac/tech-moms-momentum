/**
 * Server-side fact gathering shared by the Gemini drafting actions (drawer and pipeline cards).
 * Uses only data that already exists for the funder. Not a server action: never imported by client code.
 */
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ORG_PROFILE } from "@/config/org-profile";
import { normalizeOrgName } from "@/lib/irs/normalize";
import { pickDraftType, TECH_MOMS_MISSION } from "@/lib/outreach";
import { usd } from "@/components/ui";

const SELF = normalizeOrgName("Tech-Moms");
const MAX_FACT_CHARS = 300;

const clip = (s: string) => (s.length > MAX_FACT_CHARS ? `${s.slice(0, MAX_FACT_CHARS - 1)}…` : s);

/** Gathers only facts that already exist for this funder. */
export async function loadFunderFacts(funderId: number, opportunityId: number | null) {
  const [funder] = await db.select().from(schema.funders).where(eq(schema.funders.id, funderId));
  if (!funder) return null;

  const [grants, opps, [score], fields] = await Promise.all([
    db.select().from(schema.grantsMade).where(eq(schema.grantsMade.funderId, funderId)),
    db.select().from(schema.opportunities).where(eq(schema.opportunities.funderId, funderId)),
    db.select().from(schema.scores).where(eq(schema.scores.funderId, funderId)).orderBy(desc(schema.scores.id)).limit(1),
    db
      .select()
      .from(schema.extractedFields)
      .where(and(eq(schema.extractedFields.funderId, funderId), eq(schema.extractedFields.field, "application_info"))),
  ]);

  const pastGrants = grants.filter((g) => normalizeOrgName(g.recipientName) === SELF);
  const opp = opps.find((o) => o.id === opportunityId) ?? opps.find((o) => o.isOpen === "open") ?? opps[0] ?? null;

  const funderFacts = [
    `Funder name: ${funder.name}`,
    funder.city || funder.state ? `Location: ${[funder.city, funder.state].filter(Boolean).join(", ")}` : null,
    funder.purpose ? `Stated purpose: ${clip(funder.purpose)}` : null,
    funder.acceptsUnsolicited === false ? "Filing says it does not accept unsolicited requests." : null,
    score?.reason ? `Why it fits Tech-Moms: ${clip(score.reason)}` : null,
    opp ? `Opportunity: ${clip(opp.title)} (application route: ${opp.route})` : null,
    opp?.deadline ? `Deadline on record: ${opp.deadline}` : null,
    opp && (opp.awardMin || opp.awardMax) ? `Award range on record: ${[opp.awardMin, opp.awardMax].filter(Boolean).map((n) => usd(n)).join(" – ")}` : null,
    opp?.eligibility ? `Eligibility: ${clip(opp.eligibility)}` : null,
    ...fields.map((f) => `Application info: ${clip(JSON.stringify(f.value))}`),
  ].filter((x): x is string => !!x);

  const pastSupport = pastGrants.map(
    (g) => `Grant to ${g.recipientName}${g.amount ? ` of ${usd(g.amount)}` : ""}${g.purpose ? ` for ${clip(g.purpose)}` : ""} (public tax filing)`,
  );

  const draftType = pickDraftType({
    isVerifiedPastFunder: pastGrants.length > 0,
    route: opp?.route ?? null,
    acceptsUnsolicited: funder.acceptsUnsolicited,
  });

  const sourceUrls = [...new Set([score?.reasonSourceUrl, opp?.sourceUrl, ...fields.map((f) => f.sourceUrl)].filter((u): u is string => !!u))];

  return { funderFacts, pastSupport, draftType, sourceUrls, opportunityRoute: opp?.route ?? null };
}

export function orgFacts(): string[] {
  return [
    `Mission: ${TECH_MOMS_MISSION}`,
    `Location: ${ORG_PROFILE.location}`,
    ...ORG_PROFILE.programs.map((p) => `Program: ${p}`),
    `How grants are used: ${ORG_PROFILE.fundingUse}`,
  ];
}
