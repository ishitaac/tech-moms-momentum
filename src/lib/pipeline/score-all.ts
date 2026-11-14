/**
 * Scores every funder (foundations) and every open government listing, writes a new
 * set of `scores` rows tagged with the refresh id, and marks the top SHORTLIST_SIZE.
 * Deterministic: no AI calls here. AI results are read from extracted_fields if present.
 */
import { desc, eq, inArray, isNotNull, max } from "drizzle-orm";
import { db, schema } from "@/db";
import { COMPONENT_KEYS, DEFAULT_WEIGHTS, SHORTLIST_SIZE, type Weights } from "@/config/scoring";
import { normalizeOrgName } from "@/lib/irs/normalize";
import { computeFit } from "@/lib/scoring/fit";
import { buildReason } from "@/lib/scoring/reason";
import type { FitResult } from "@/lib/scoring/types";
import { foundationFitInput, governmentFitInput, type OpenCallFact } from "./evidence";
import { readFileSync, existsSync } from "node:fs";

const INSERT_BATCH = 500;
const GOV_TYPES = new Set(["federal", "state"]);

type ScoreRow = typeof schema.scores.$inferInsert;

export async function loadWeights(): Promise<Weights> {
  const [s] = await db.select({ weights: schema.settings.weights }).from(schema.settings).limit(1);
  const w = s?.weights;
  if (!w) return DEFAULT_WEIGHTS;
  return Object.fromEntries(COMPONENT_KEYS.map((k) => [k, typeof w[k] === "number" ? w[k] : DEFAULT_WEIGHTS[k]])) as Weights;
}

function loadPeerNames(): Set<string> {
  const path = "data/peer-orgs.json";
  if (!existsSync(path)) return new Set();
  const list = JSON.parse(readFileSync(path, "utf8")) as { name: string; keep: boolean | null }[];
  return new Set(list.filter((p) => p.keep !== false).map((p) => normalizeOrgName(p.name)));
}

function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

function toRow(funderId: number, opportunityId: number | null, refreshId: number, fit: FitResult): ScoreRow {
  const reason = buildReason(fit);
  return {
    funderId,
    opportunityId,
    refreshId,
    total: fit.total,
    band: fit.band,
    confidence: fit.confidence,
    components: fit.components,
    gates: fit.gates,
    reason: reason.text,
    reasonSourceUrl: reason.sourceUrl,
    excludedReason: fit.excludedReason,
  };
}

async function foundationRows(refreshId: number, weights: Weights): Promise<ScoreRow[]> {
  const funders = await db.select().from(schema.funders);
  const foundations = funders.filter((f) => !GOV_TYPES.has(f.type));
  const filings = await db.select().from(schema.filings).orderBy(desc(schema.filings.taxYear));
  const grants = await db
    .select({
      funderId: schema.grantsMade.funderId,
      recipientName: schema.grantsMade.recipientName,
      recipientState: schema.grantsMade.recipientState,
      amount: schema.grantsMade.amount,
      purpose: schema.grantsMade.purpose,
    })
    .from(schema.grantsMade);
  const opps = await db.select().from(schema.opportunities).where(eq(schema.opportunities.isOpen, "open"));
  const fields = await db
    .select()
    .from(schema.extractedFields)
    .where(inArray(schema.extractedFields.field, ["mission_rating", "website_text"]));
  const [{ latest }] = await db.select({ latest: max(schema.filings.taxYear) }).from(schema.filings);

  const filingBy = groupBy(filings, (f) => f.funderId);
  const grantsBy = groupBy(grants, (g) => g.funderId);
  const oppBy = groupBy(opps, (o) => o.funderId);
  const fieldsBy = groupBy(fields, (f) => f.funderId);
  const peers = loadPeerNames();
  const latestAvailableYear = latest ?? new Date().getFullYear() - 1;

  return foundations.map((f) => {
    const filing = filingBy.get(f.id)?.[0] ?? null;
    const fx = fieldsBy.get(f.id) ?? [];
    const rating = (fx.find((x) => x.field === "mission_rating")?.value as { rating?: number } | undefined)?.rating;
    const site = fx.find((x) => x.field === "website_text")?.value;
    const opp = oppBy.get(f.id)?.[0];
    const openCall: OpenCallFact | null = opp ? { deadline: opp.deadline, route: opp.route, sourceUrl: opp.sourceUrl } : null;

    const fit = computeFit(
      foundationFitInput({
        funder: f,
        filing: filing ? { taxYear: filing.taxYear, totalGiving: filing.totalGiving, sourceUrl: filing.sourceUrl } : null,
        grants: grantsBy.get(f.id) ?? [],
        peerNames: peers,
        latestAvailableYear,
        missionAiRating: typeof rating === "number" ? rating : null,
        websiteText: typeof site === "string" ? site : null,
        openCall,
      }),
      weights,
    );
    return toRow(f.id, null, refreshId, fit);
  });
}

async function governmentRows(refreshId: number, weights: Weights): Promise<ScoreRow[]> {
  const rows = await db
    .select({ opp: schema.opportunities, funder: schema.funders })
    .from(schema.opportunities)
    .innerJoin(schema.funders, eq(schema.opportunities.funderId, schema.funders.id))
    .where(isNotNull(schema.opportunities.id));
  const fields = await db.select().from(schema.extractedFields).where(eq(schema.extractedFields.field, "mission_rating"));

  return rows
    .filter((r) => GOV_TYPES.has(r.funder.type))
    .map(({ opp, funder }) => {
      const rating = fields.find((x) => x.funderId === funder.id && (x.value as { opportunityId?: number })?.opportunityId === opp.id);
      const fit = computeFit(
        governmentFitInput({
          title: opp.title,
          description: opp.description,
          eligibility: opp.eligibility,
          geography: opp.geography,
          awardMin: opp.awardMin,
          awardMax: opp.awardMax,
          deadline: opp.deadline,
          route: opp.route,
          sourceUrl: opp.sourceUrl,
          missionAiRating: (rating?.value as { rating?: number } | undefined)?.rating ?? null,
        }),
        weights,
      );
      return toRow(funder.id, opp.id, refreshId, fit);
    });
}

export interface ScoreSummary {
  scored: number;
  excluded: number;
  shortlisted: number;
}

export async function scoreAll(refreshId: number): Promise<ScoreSummary> {
  const weights = await loadWeights();
  const rows = [...(await foundationRows(refreshId, weights)), ...(await governmentRows(refreshId, weights))];

  const ranked = rows
    .filter((r) => r.total !== null && r.total !== undefined && !r.excludedReason)
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  const shortlist = new Set(ranked.slice(0, SHORTLIST_SIZE));
  for (const r of rows) r.isShortlisted = shortlist.has(r);

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    await db.insert(schema.scores).values(rows.slice(i, i + INSERT_BATCH));
  }
  return { scored: rows.length, excluded: rows.filter((r) => r.excludedReason).length, shortlisted: shortlist.size };
}
