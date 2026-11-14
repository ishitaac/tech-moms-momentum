/**
 * The 14-day refresh (PRD §Refresh and notifications):
 *   1. pull light sources (Grants.gov, Utah pages, funder websites) — a failed source is skipped and logged
 *   2. AI only on the shortlist, only for funders whose content changed, under the token cap
 *   3. deterministic re-score
 *   4. notifications (in-app + email summary)
 * Heavy 990 ingest is NOT here — it runs locally (scripts/ingest).
 */
import { createHash } from "node:crypto";
import { differenceInCalendarDays } from "date-fns";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { isAiConfigured, UsageMeter } from "@/lib/ai/provider";
import { detectOpenCall, grantPages, polishReason, rateMission, fetchPageText } from "@/lib/ai/extract";
import { isFaithfulRewrite } from "@/lib/scoring/reason";
import { grantsGovAdapter } from "@/lib/sources/grants-gov";
import { utahPagesAdapter } from "@/lib/sources/utah-pages";
import type { SourceAdapter, SourceError } from "@/lib/sources/types";
import { notifyAfterRefresh } from "./notify";
import { saveOpportunities } from "./save-opportunities";
import { scoreAll } from "./score-all";

const REFRESH_INTERVAL_DAYS = 14;
const WEBSITE_CONCURRENCY = 6;
const SOURCES: SourceAdapter[] = [grantsGovAdapter, utahPagesAdapter];

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

export async function isRefreshDue(): Promise<boolean> {
  const [last] = await db
    .select({ startedAt: schema.refreshes.startedAt })
    .from(schema.refreshes)
    .where(eq(schema.refreshes.status, "ok"))
    .orderBy(desc(schema.refreshes.id))
    .limit(1);
  return !last || differenceInCalendarDays(new Date(), last.startedAt) >= REFRESH_INTERVAL_DAYS;
}

async function pullSources(errors: SourceError[]): Promise<number[]> {
  const newOpenCalls: number[] = [];
  for (const source of SOURCES) {
    try {
      const r = await source.fetch();
      errors.push(...r.errors);
      const saved = await saveOpportunities(r.items);
      newOpenCalls.push(...saved.newOpenCallIds);
    } catch (err) {
      errors.push({ source: source.id, message: `skipped: ${String(err).slice(0, 200)}` });
    }
  }
  return newOpenCalls;
}

async function upsertField(funderId: number, field: string, value: unknown, sourceUrl: string, model: string | null) {
  await db
    .delete(schema.extractedFields)
    .where(and(eq(schema.extractedFields.funderId, funderId), eq(schema.extractedFields.field, field)));
  await db.insert(schema.extractedFields).values({ funderId, field, value, sourceUrl, model });
}

/** Reads websites of shortlisted funders whose page text changed; rates mission and detects open calls. */
async function aiEnrichShortlist(meter: UsageMeter, errors: SourceError[]): Promise<{ processed: number; skipped: number }> {
  const [latest] = await db.select({ id: schema.refreshes.id }).from(schema.refreshes).where(eq(schema.refreshes.status, "ok")).orderBy(desc(schema.refreshes.id)).limit(1);
  if (!latest) return { processed: 0, skipped: 0 };

  const shortlist = await db
    .select({ f: schema.funders })
    .from(schema.scores)
    .innerJoin(schema.funders, eq(schema.scores.funderId, schema.funders.id))
    .where(and(eq(schema.scores.refreshId, latest.id), eq(schema.scores.isShortlisted, true)));
  const withSites = shortlist.map((r) => r.f).filter((f) => f.website && f.type !== "federal");

  const hashes = await db
    .select()
    .from(schema.extractedFields)
    .where(and(inArray(schema.extractedFields.funderId, withSites.map((f) => f.id).concat(0)), eq(schema.extractedFields.field, "website_hash")));
  const hashBy = new Map(hashes.map((h) => [h.funderId, h.value as string]));

  type Outcome = "processed" | "skipped" | "failed";
  const enrichOne = async (f: (typeof withSites)[number]): Promise<Outcome> => {
    const pages = await grantPages(f.website!);
    const texts = (await Promise.all(pages.map(fetchPageText))).filter((t): t is string => !!t);
    if (!texts.length) {
      errors.push({ source: "website", message: `Could not read ${f.name}'s website`, url: f.website! });
      return "failed";
    }
    const combined = texts.join("\n\n");
    const h = hash(combined);
    if (hashBy.get(f.id) === h) return "skipped";

    const mission = await rateMission(combined, meter);
    if (mission) await upsertField(f.id, "mission_rating", { rating: mission.rating, quote: mission.quote }, pages[0], mission.model);
    await upsertField(f.id, "website_text", combined.slice(0, 4000), pages[0], null);

    for (const url of pages) {
      const call = await detectOpenCall(url, meter);
      if (call?.isOpen !== "open") continue;
      await saveOpportunities([
        {
          externalId: `web:${f.id}:${hash(url)}`,
          funderName: f.name,
          funderType: f.type,
          title: `${f.name} grant cycle`,
          description: call.quote,
          eligibility: null,
          geography: null,
          awardMin: call.awardMin,
          awardMax: call.awardMax,
          deadline: call.deadline,
          isOpen: "open",
          route: call.route,
          sourceUrl: call.sourceUrl,
          website: f.website,
        },
      ]);
      break;
    }
    await upsertField(f.id, "website_hash", h, pages[0], null);
    return "processed";
  };

  // Small worker pool: websites are slow (~20s each sequentially); keep load on funder sites polite.
  let processed = 0;
  let skipped = 0;
  let next = 0;
  let capNoted = false;
  const worker = async () => {
    while (next < withSites.length) {
      if (meter.exhausted) {
        if (!capNoted) errors.push({ source: "ai", message: "Token cap reached — remaining funders keep their previous results." });
        capNoted = true;
        return;
      }
      const f = withSites[next++];
      try {
        const outcome = await enrichOne(f);
        if (outcome === "processed") processed++;
        if (outcome === "skipped") skipped++;
      } catch (err) {
        errors.push({ source: "ai", message: `${f.name}: ${String(err).slice(0, 160)}` });
      }
    }
  };
  await Promise.all(Array.from({ length: WEBSITE_CONCURRENCY }, worker));
  return { processed, skipped };
}

/** Optional AI polish of reason lines for the shortlist; only kept if it adds no new facts. */
async function polishReasons(refreshId: number, meter: UsageMeter): Promise<void> {
  const rows = await db
    .select({ id: schema.scores.id, reason: schema.scores.reason })
    .from(schema.scores)
    .where(and(eq(schema.scores.refreshId, refreshId), eq(schema.scores.isShortlisted, true)));
  for (const r of rows) {
    if (meter.exhausted || !r.reason || r.reason.startsWith("Unknown")) continue;
    const polished = await polishReason(r.reason, meter).catch(() => null);
    if (polished && isFaithfulRewrite(r.reason, polished)) {
      await db.update(schema.scores).set({ reason: polished }).where(eq(schema.scores.id, r.id));
    }
  }
}

async function finish(refreshId: number, values: Partial<typeof schema.refreshes.$inferInsert>) {
  await db.update(schema.refreshes).set({ finishedAt: new Date(), ...values }).where(eq(schema.refreshes.id, refreshId));
}

/** Re-score only (e.g. after a weight change). No source pulls, no AI, no notifications. */
export async function rescore(message: string): Promise<void> {
  const [refresh] = await db.insert(schema.refreshes).values({}).returning({ id: schema.refreshes.id });
  const summary = await scoreAll(refresh.id);
  await finish(refresh.id, { status: "ok", fundersSeen: summary.scored, message });
}

export async function runRefresh({ force = false } = {}): Promise<{ ran: boolean; refreshId?: number }> {
  if (!force && !(await isRefreshDue())) return { ran: false };

  const [settings] = await db.select().from(schema.settings).limit(1);
  const meter = new UsageMeter(settings?.tokenCapPerRefresh ?? 2_000_000);
  const errors: SourceError[] = [];
  const [refresh] = await db.insert(schema.refreshes).values({}).returning({ id: schema.refreshes.id });

  try {
    const newOpenCalls = await pullSources(errors);
    let ai = { processed: 0, skipped: 0 };
    if (isAiConfigured()) ai = await aiEnrichShortlist(meter, errors);
    else errors.push({ source: "ai", message: "AI is off (set AI_ENABLED=true and a key) — scored from public filings only." });

    const summary = await scoreAll(refresh.id);
    if (isAiConfigured()) await polishReasons(refresh.id, meter);

    await finish(refresh.id, {
      status: "ok",
      fundersSeen: summary.scored,
      fundersProcessed: ai.processed,
      fundersSkippedCached: ai.skipped,
      tokensIn: meter.tokensIn,
      tokensOut: meter.tokensOut,
      estCostUsd: meter.costUsd,
      sourceErrors: errors,
      message: meter.exhausted ? "Stopped AI early: token cap reached" : null,
    });
    await notifyAfterRefresh(refresh.id, newOpenCalls).catch((err) => console.error("notify failed", err));
    return { ran: true, refreshId: refresh.id };
  } catch (err) {
    await finish(refresh.id, { status: "failed", sourceErrors: errors, message: String(err).slice(0, 500) });
    throw err;
  }
}
