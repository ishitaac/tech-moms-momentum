/**
 * Creates in-app notifications after a refresh and sends one summary email (Resend).
 * Deduplicated by dedupe_key so re-running never double-notifies.
 */
import { differenceInCalendarDays, parseISO } from "date-fns";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { Resend } from "resend";
import { db, schema } from "@/db";

type NewNotification = typeof schema.notifications.$inferInsert;

const MAX_NEW_MATCH_NOTES = 10;

async function insertNew(rows: NewNotification[]): Promise<NewNotification[]> {
  if (!rows.length) return [];
  const inserted = await db.insert(schema.notifications).values(rows).onConflictDoNothing().returning();
  return inserted;
}

async function newMatchNotes(refreshId: number): Promise<NewNotification[]> {
  const prev = await db
    .select({ id: schema.refreshes.id })
    .from(schema.refreshes)
    .where(and(eq(schema.refreshes.status, "ok")))
    .orderBy(schema.refreshes.id);
  const prevId = prev.map((p) => p.id).filter((id) => id < refreshId).pop();
  const current = await db
    .select({ funderId: schema.scores.funderId, oppId: schema.scores.opportunityId, total: schema.scores.total, name: schema.funders.name, reason: schema.scores.reason })
    .from(schema.scores)
    .innerJoin(schema.funders, eq(schema.scores.funderId, schema.funders.id))
    .where(and(eq(schema.scores.refreshId, refreshId), eq(schema.scores.isShortlisted, true)));

  if (!prevId) {
    return [{ kind: "new_match", title: `${current.length} ranked matches are ready`, body: "Your first ranked list of funders is ready to review.", link: "/", dedupeKey: `first-list:${refreshId}` }];
  }
  const before = await db
    .select({ funderId: schema.scores.funderId, oppId: schema.scores.opportunityId })
    .from(schema.scores)
    .where(and(eq(schema.scores.refreshId, prevId), eq(schema.scores.isShortlisted, true)));
  const seen = new Set(before.map((b) => `${b.funderId}:${b.oppId}`));
  return current
    .filter((c) => !seen.has(`${c.funderId}:${c.oppId}`))
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    .slice(0, MAX_NEW_MATCH_NOTES)
    .map((c) => ({
      kind: "new_match" as const,
      title: `New match: ${c.name} (fit ${c.total})`,
      body: c.reason,
      link: `/?funder=${c.funderId}`,
      dedupeKey: `match:${c.funderId}:${c.oppId ?? ""}`,
    }));
}

async function openCallNotes(oppIds: number[]): Promise<NewNotification[]> {
  if (!oppIds.length) return [];
  const opps = await db
    .select({ o: schema.opportunities, name: schema.funders.name })
    .from(schema.opportunities)
    .innerJoin(schema.funders, eq(schema.opportunities.funderId, schema.funders.id))
    .where(inArray(schema.opportunities.id, oppIds));
  return opps.map(({ o, name }) => ({
    kind: "open_call" as const,
    title: `Open call: ${name}`,
    body: `${o.title}${o.deadline ? ` — due ${o.deadline}` : ""}`,
    link: o.sourceUrl,
    dedupeKey: `open:${o.id}`,
  }));
}

/** Deadline reminders at the configured intervals for pipeline items and open calls on approved funders. */
export async function deadlineNotes(reminderDays: number[], today = new Date()): Promise<NewNotification[]> {
  const items = await db
    .select({ p: schema.pipelineItems, name: schema.funders.name })
    .from(schema.pipelineItems)
    .innerJoin(schema.funders, eq(schema.pipelineItems.funderId, schema.funders.id))
    .where(isNotNull(schema.pipelineItems.deadline));
  const notes: NewNotification[] = [];
  for (const { p, name } of items) {
    if (p.stage === "declined" || p.stage === "awarded") continue;
    const days = differenceInCalendarDays(parseISO(p.deadline!), today);
    const hit = reminderDays.filter((d) => days <= d && days >= 0).sort((a, b) => a - b)[0];
    if (hit === undefined) continue;
    notes.push({
      kind: "deadline",
      title: `${name}: due in ${days} day${days === 1 ? "" : "s"}`,
      body: `Deadline ${p.deadline}`,
      link: "/pipeline",
      dedupeKey: `deadline:${p.id}:${hit}`,
    });
  }
  return notes;
}

async function sendEmail(to: string, notes: NewNotification[]): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !notes.length) return;
  const resend = new Resend(key);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const line = (n: NewNotification) =>
    `<li><strong>${escapeHtml(n.title)}</strong>${n.body ? `<br/><span style="color:#5b6470">${escapeHtml(n.body)}</span>` : ""}</li>`;
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Funder Finder <onboarding@resend.dev>",
    to,
    subject: `Funder Finder: ${notes.length} update${notes.length === 1 ? "" : "s"}`,
    html: `<div style="font-family:sans-serif;color:#24292f"><h2 style="color:#2b5672">Funder Finder update</h2><ul>${notes.map(line).join("")}</ul><p><a href="${base}">Open Funder Finder</a></p><p style="font-size:12px;color:#5b6470">Public data only. AI assists; you decide.</p></div>`,
  });
  if (error) console.error("Resend error", error);
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function notifyAfterRefresh(refreshId: number, newOpenCallIds: number[]): Promise<number> {
  const [settings] = await db.select().from(schema.settings).limit(1);
  const kinds = new Set(settings?.alertKinds ?? ["new_match", "open_call", "deadline"]);
  const candidates = [
    ...(kinds.has("new_match") ? await newMatchNotes(refreshId) : []),
    ...(kinds.has("open_call") ? await openCallNotes(newOpenCallIds) : []),
    ...(kinds.has("deadline") ? await deadlineNotes(settings?.reminderDays ?? [14, 7, 2]) : []),
  ];
  const inserted = await insertNew(candidates);
  if (settings?.notifyEmail) await sendEmail(settings.notifyEmail, inserted);
  return inserted.length;
}
