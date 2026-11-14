"use server";

import { addDays, formatISO } from "date-fns";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { COMPONENT_KEYS } from "@/config/scoring";
import { funderDetail, type FunderDetail } from "@/lib/queries";
import { PURPOSES, type Purpose, type PurposeGoals } from "@/lib/purposes";

export type ActionResult = { ok: true } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });

const decisionSchema = z.object({
  funderId: z.number().int().positive(),
  opportunityId: z.number().int().positive().nullable(),
  action: z.enum(["approve", "snooze", "reject"]),
});

/** Approve → pipeline prospect; snooze → hidden for settings.snoozeDays; reject → hidden next refresh. */
export async function decide(input: z.infer<typeof decisionSchema>): Promise<ActionResult> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid decision");
  const { funderId, opportunityId, action } = parsed.data;

  try {
    const [s] = await db.select({ snoozeDays: schema.settings.snoozeDays }).from(schema.settings).limit(1);
    const snoozeUntil = action === "snooze" ? formatISO(addDays(new Date(), s?.snoozeDays ?? 30), { representation: "date" }) : null;
    await db.insert(schema.decisions).values({ funderId, action, snoozeUntil });

    if (action === "approve") {
      const [existing] = await db
        .select({ id: schema.pipelineItems.id })
        .from(schema.pipelineItems)
        .where(and(eq(schema.pipelineItems.funderId, funderId), eq(schema.pipelineItems.isSample, false)))
        .limit(1);
      if (!existing) {
        const [opp] = opportunityId
          ? await db.select().from(schema.opportunities).where(eq(schema.opportunities.id, opportunityId))
          : [];
        await db.insert(schema.pipelineItems).values({
          funderId,
          opportunityId,
          stage: "prospect",
          deadline: opp?.deadline ?? null,
        });
      }
    }
  } catch (err) {
    console.error("decide failed", err);
    return fail("Could not save your decision. Please try again.");
  }
  revalidatePath("/");
  revalidatePath("/pipeline");
  return { ok: true };
}

export async function loadFunderDetail(funderId: number): Promise<FunderDetail | null> {
  if (!Number.isInteger(funderId) || funderId <= 0) return null;
  return funderDetail(funderId);
}

const stageSchema = z.object({
  id: z.number().int().positive(),
  stage: z.enum(["prospect", "loi", "submitted", "awarded", "declined"]),
});

export async function moveStage(input: z.infer<typeof stageSchema>): Promise<ActionResult> {
  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid stage");
  const { id, stage } = parsed.data;
  const awardedOn = stage === "awarded" ? formatISO(new Date(), { representation: "date" }) : undefined;
  await db
    .update(schema.pipelineItems)
    .set({ stage, updatedAt: new Date(), ...(awardedOn ? { awardedOn } : {}) })
    .where(eq(schema.pipelineItems.id, id));
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true };
}

const money = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(/[$,]/g, ""))),
  z.number().nonnegative().max(100_000_000).nullable(),
);

const purposeField = z.enum(PURPOSES).nullable().optional();
const amountsSchema = z.object({ id: z.number().int().positive(), amountAsked: money, amountAwarded: money, purpose: purposeField });

/** `purpose` is optional: leave it out to keep the current value, or pass null to clear it. */
export async function updateAmounts(input: { id: number; amountAsked: unknown; amountAwarded: unknown; purpose?: Purpose | null }): Promise<ActionResult> {
  const parsed = amountsSchema.safeParse(input);
  if (!parsed.success) return fail("Amounts must be positive numbers");
  const { id, amountAsked, amountAwarded, purpose } = parsed.data;
  await db
    .update(schema.pipelineItems)
    .set({ amountAsked, amountAwarded, ...(purpose !== undefined ? { purpose } : {}), updatedAt: new Date() })
    .where(eq(schema.pipelineItems.id, id));
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true };
}

const paymentSchema = z.object({
  pipelineItemId: z.number().int().positive(),
  amount: z.number().positive().max(100_000_000),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function addPayment(input: z.infer<typeof paymentSchema>): Promise<ActionResult> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return fail("Enter an amount and a date");
  await db.insert(schema.payments).values(parsed.data);
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function markNotificationsRead(ids?: number[]): Promise<ActionResult> {
  const now = new Date();
  if (ids?.length) {
    for (const id of ids.filter(Number.isInteger)) {
      await db.update(schema.notifications).set({ readAt: now }).where(eq(schema.notifications.id, id));
    }
  } else {
    await db.update(schema.notifications).set({ readAt: now }).where(isNull(schema.notifications.readAt));
  }
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true };
}

const settingsSchema = z.object({
  notifyEmail: z.union([z.literal(""), z.email()]),
  alertKinds: z.array(z.enum(["new_match", "open_call", "deadline"])),
  reminderDays: z.array(z.number().int().min(0).max(120)).max(6),
  snoozeDays: z.number().int().min(1).max(365),
});

export async function saveSettings(input: z.infer<typeof settingsSchema>): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid settings");
  const v = parsed.data;
  await db
    .insert(schema.settings)
    .values({ id: 1, ...v, notifyEmail: v.notifyEmail || null })
    .onConflictDoUpdate({ target: schema.settings.id, set: { ...v, notifyEmail: v.notifyEmail || null } });
  revalidatePath("/settings");
  return { ok: true };
}

const goalsSchema = z.object(Object.fromEntries(PURPOSES.map((p) => [p, z.number().int().min(0).max(100_000_000).optional()])));

/** Saves the annual funding goal per purpose. Saving always replaces the SAMPLE placeholder goals. */
export async function savePurposeGoals(goals: PurposeGoals): Promise<ActionResult> {
  const parsed = goalsSchema.safeParse(goals);
  if (!parsed.success) return fail("Goals must be whole dollar amounts from 0 to 100,000,000");
  const purposeGoals = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)) as PurposeGoals;
  await db
    .insert(schema.settings)
    .values({ id: 1, purposeGoals, purposeGoalsSample: false })
    .onConflictDoUpdate({ target: schema.settings.id, set: { purposeGoals, purposeGoalsSample: false } });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

const weightsSchema = z.object(Object.fromEntries(COMPONENT_KEYS.map((k) => [k, z.number().min(0).max(1)])));

/** Weight tuning (flagged): saves weights, then re-scores without any AI calls. */
export async function saveWeights(weights: Record<string, number> | null): Promise<ActionResult> {
  if (weights !== null && !weightsSchema.safeParse(weights).success) return fail("Weights must be between 0 and 1");
  await db
    .insert(schema.settings)
    .values({ id: 1, weights })
    .onConflictDoUpdate({ target: schema.settings.id, set: { weights } });
  const { rescore } = await import("@/lib/pipeline/refresh");
  await rescore("Re-ranked after weight change");
  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true };
}

export async function clearSampleData(): Promise<ActionResult> {
  await db.delete(schema.pipelineItems).where(eq(schema.pipelineItems.isSample, true));
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function refreshNow(): Promise<ActionResult> {
  try {
    const { runRefresh } = await import("@/lib/pipeline/refresh");
    await runRefresh({ force: true });
  } catch (err) {
    console.error("refresh failed", err);
    return fail("Refresh failed — see server logs. Existing results are unchanged.");
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
