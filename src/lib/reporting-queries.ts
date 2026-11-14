/** Read-side queries for the Reporting tabs. */
import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { applicationDeadlines, type DeadlineItem } from "./reporting-model";
import { paymentRows, pipelineCards } from "./pipeline-queries";
import type { PurposeGoals } from "./purposes";

export interface FundingHealthData {
  today: string;
  cards: Awaited<ReturnType<typeof pipelineCards>>;
  payments: Awaited<ReturnType<typeof paymentRows>>;
  goals: PurposeGoals;
  goalsAreSample: boolean;
  dueSoon: DeadlineItem[];
}

export async function fundingHealthData(): Promise<FundingHealthData> {
  await connection();
  // Read the clock only after connection() so Cache Components treats this as request-time.
  const today = new Date().toISOString().slice(0, 10);
  const [cards, payments, [settings], opps] = await Promise.all([
    pipelineCards(),
    paymentRows(),
    db.select().from(schema.settings).limit(1),
    db
      .select({ o: schema.opportunities, name: schema.funders.name })
      .from(schema.opportunities)
      .innerJoin(schema.funders, eq(schema.opportunities.funderId, schema.funders.id))
      .where(eq(schema.opportunities.isOpen, "open")),
  ]);
  const openCalls = opps.map(({ o, name }) => ({ id: o.id, funderName: name, title: o.title, deadline: o.deadline }));
  return {
    today,
    cards,
    payments,
    goals: settings?.purposeGoals ?? {},
    goalsAreSample: settings?.purposeGoalsSample ?? false,
    dueSoon: applicationDeadlines(cards, openCalls, today),
  };
}
