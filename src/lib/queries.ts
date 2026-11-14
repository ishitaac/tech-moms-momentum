/** Read-side queries for the UI. Every function opts into request-time rendering. */
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import type { FitResult } from "@/lib/scoring/types";

export type Decision = "approve" | "snooze" | "reject" | null;

export interface ListRow {
  scoreId: number;
  funderId: number;
  opportunityId: number | null;
  name: string;
  title: string | null;
  type: string;
  state: string | null;
  total: number | null;
  band: string | null;
  confidence: string | null;
  reason: string | null;
  reasonSourceUrl: string | null;
  excludedReason: string | null;
  isShortlisted: boolean;
  isOpen: boolean;
  deadline: string | null;
  route: string | null;
  filingYear: number | null;
  website: string | null;
  isSeed: boolean;
  isNew: boolean;
  decision: Decision;
  snoozeUntil: string | null;
  components: FitResult["components"];
}

export async function latestRefresh() {
  await connection();
  const [r] = await db
    .select()
    .from(schema.refreshes)
    .where(eq(schema.refreshes.status, "ok"))
    .orderBy(desc(schema.refreshes.id))
    .limit(1);
  return r ?? null;
}

async function previousRefreshId(currentId: number): Promise<number | null> {
  const [r] = await db
    .select({ id: schema.refreshes.id })
    .from(schema.refreshes)
    .where(and(eq(schema.refreshes.status, "ok"), sql`${schema.refreshes.id} < ${currentId}`))
    .orderBy(desc(schema.refreshes.id))
    .limit(1);
  return r?.id ?? null;
}

async function latestDecisions(): Promise<Map<number, { action: Decision; snoozeUntil: string | null }>> {
  const rows = await db
    .selectDistinctOn([schema.decisions.funderId], {
      funderId: schema.decisions.funderId,
      action: schema.decisions.action,
      snoozeUntil: schema.decisions.snoozeUntil,
    })
    .from(schema.decisions)
    .orderBy(schema.decisions.funderId, desc(schema.decisions.createdAt));
  return new Map(rows.map((r) => [r.funderId, { action: r.action, snoozeUntil: r.snoozeUntil }]));
}

const key = (funderId: number, oppId: number | null) => `${funderId}:${oppId ?? ""}`;

/** All scored rows from the latest refresh, with decision state and "new" flag. */
export type Refresh = typeof schema.refreshes.$inferSelect;

export async function rankedRows(): Promise<{ rows: ListRow[]; refresh: Refresh | null }> {
  const refresh = await latestRefresh();
  if (!refresh) return { rows: [], refresh: null };

  const raw = await db
    .select({ s: schema.scores, f: schema.funders, o: schema.opportunities })
    .from(schema.scores)
    .innerJoin(schema.funders, eq(schema.scores.funderId, schema.funders.id))
    .leftJoin(schema.opportunities, eq(schema.scores.opportunityId, schema.opportunities.id))
    .where(eq(schema.scores.refreshId, refresh.id));

  const prevId = await previousRefreshId(refresh.id);
  const prevKeys = new Set<string>();
  if (prevId) {
    const prev = await db
      .select({ f: schema.scores.funderId, o: schema.scores.opportunityId })
      .from(schema.scores)
      .where(and(eq(schema.scores.refreshId, prevId), eq(schema.scores.isShortlisted, true)));
    for (const p of prev) prevKeys.add(key(p.f, p.o));
  }

  const funderIds = [...new Set(raw.map((r) => r.f.id))];
  const openCalls = funderIds.length
    ? await db
        .select()
        .from(schema.opportunities)
        .where(and(inArray(schema.opportunities.funderId, funderIds), eq(schema.opportunities.isOpen, "open")))
    : [];
  const openBy = new Map(openCalls.map((o) => [o.funderId, o]));
  const filings = funderIds.length
    ? await db
        .selectDistinctOn([schema.filings.funderId], { funderId: schema.filings.funderId, taxYear: schema.filings.taxYear })
        .from(schema.filings)
        .orderBy(schema.filings.funderId, desc(schema.filings.taxYear))
    : [];
  const filingBy = new Map(filings.map((f) => [f.funderId, f.taxYear]));
  const decisions = await latestDecisions();

  const rows: ListRow[] = raw.map(({ s, f, o }) => {
    const opp = o ?? openBy.get(f.id) ?? null;
    const d = decisions.get(f.id);
    return {
      scoreId: s.id,
      funderId: f.id,
      opportunityId: s.opportunityId,
      name: f.name,
      title: o?.title ?? null,
      type: f.type,
      state: f.state,
      total: s.total,
      band: s.band,
      confidence: s.confidence,
      reason: s.reason,
      reasonSourceUrl: s.reasonSourceUrl,
      excludedReason: s.excludedReason,
      isShortlisted: s.isShortlisted,
      isOpen: opp?.isOpen === "open",
      deadline: opp?.deadline ?? null,
      route: opp?.route ?? null,
      filingYear: filingBy.get(f.id) ?? null,
      website: f.website,
      isSeed: f.isSeed,
      isNew: prevId !== null && s.isShortlisted && !prevKeys.has(key(f.id, s.opportunityId)),
      decision: d?.action ?? null,
      snoozeUntil: d?.snoozeUntil ?? null,
      components: s.components as FitResult["components"],
    };
  });
  rows.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  return { rows, refresh };
}

export async function unreadNotificationCount(): Promise<number> {
  await connection();
  const [r] = await db.select({ n: count() }).from(schema.notifications).where(isNull(schema.notifications.readAt));
  return r?.n ?? 0;
}

export async function funderDetail(funderId: number) {
  await connection();
  const [funder] = await db.select().from(schema.funders).where(eq(schema.funders.id, funderId));
  if (!funder) return null;
  const [filing] = await db
    .select()
    .from(schema.filings)
    .where(eq(schema.filings.funderId, funderId))
    .orderBy(desc(schema.filings.taxYear))
    .limit(1);
  const topGrants = await db
    .select()
    .from(schema.grantsMade)
    .where(eq(schema.grantsMade.funderId, funderId))
    .orderBy(sql`${schema.grantsMade.recipientState} = 'UT' desc`, desc(schema.grantsMade.amount))
    .limit(8);
  const people = await db.select().from(schema.people).where(eq(schema.people.funderId, funderId));
  const opps = await db.select().from(schema.opportunities).where(eq(schema.opportunities.funderId, funderId));
  const appInfo = await db
    .select()
    .from(schema.extractedFields)
    .where(and(eq(schema.extractedFields.funderId, funderId), eq(schema.extractedFields.field, "application_info")))
    .limit(1);
  return {
    funder,
    filing: filing ?? null,
    topGrants,
    people,
    opportunities: opps,
    applicationInfo: (appInfo[0]?.value as { materials: string | null; deadlines: string | null; restrictions: string | null } | undefined) ?? null,
    applicationSourceUrl: appInfo[0]?.sourceUrl ?? null,
  };
}
export type FunderDetail = NonNullable<Awaited<ReturnType<typeof funderDetail>>>;
