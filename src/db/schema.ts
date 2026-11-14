import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const funderType = pgEnum("funder_type", [
  "state",
  "federal",
  "corporate",
  "foundation",
  "family_foundation",
]);
export const formType = pgEnum("form_type", ["990", "990PF", "990EZ"]);
export const openStatus = pgEnum("open_status", ["open", "unknown"]);
export const route = pgEnum("route", ["loi", "direct", "unknown"]);
export const decisionAction = pgEnum("decision_action", ["approve", "snooze", "reject"]);
export const stage = pgEnum("stage", ["prospect", "loi", "submitted", "awarded", "declined"]);
export const notificationKind = pgEnum("notification_kind", ["new_match", "open_call", "deadline"]);

const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const funders = pgTable("funders", {
  id: serial("id").primaryKey(),
  ein: text("ein").unique(),
  name: text("name").notNull(),
  type: funderType("type").notNull(),
  city: text("city"),
  state: text("state"),
  website: text("website"),
  ntee: text("ntee"),
  purpose: text("purpose"),
  latestFilingYear: integer("latest_filing_year"),
  acceptsUnsolicited: boolean("accepts_unsolicited"),
  contentHash: text("content_hash"),
  isSeed: boolean("is_seed").default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const filings = pgTable("filings", {
  id: serial("id").primaryKey(),
  funderId: integer("funder_id").references(() => funders.id, { onDelete: "cascade" }).notNull(),
  taxYear: integer("tax_year").notNull(),
  form: formType("form").notNull(),
  sourceUrl: text("source_url").notNull(),
  pdfUrl: text("pdf_url"),
  totalGiving: money("total_giving"),
  totalAssets: money("total_assets"),
});

export const grantsMade = pgTable("grants_made", {
  id: serial("id").primaryKey(),
  funderId: integer("funder_id").references(() => funders.id, { onDelete: "cascade" }).notNull(),
  filingId: integer("filing_id").references(() => filings.id, { onDelete: "cascade" }),
  recipientName: text("recipient_name").notNull(),
  recipientEin: text("recipient_ein"),
  recipientCity: text("recipient_city"),
  recipientState: text("recipient_state"),
  amount: money("amount"),
  purpose: text("purpose"),
});

export const opportunities = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  funderId: integer("funder_id").references(() => funders.id, { onDelete: "cascade" }).notNull(),
  externalId: text("external_id"),
  title: text("title").notNull(),
  sourceUrl: text("source_url").notNull(),
  isOpen: openStatus("is_open").default("unknown").notNull(),
  deadline: date("deadline"),
  route: route("route").default("unknown").notNull(),
  awardMin: money("award_min"),
  awardMax: money("award_max"),
  eligibility: text("eligibility"),
  geography: text("geography"),
  description: text("description"),
  rawTextHash: text("raw_text_hash"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Every fact shown in the UI that came from AI extraction carries its source URL. */
export const extractedFields = pgTable("extracted_fields", {
  id: serial("id").primaryKey(),
  funderId: integer("funder_id").references(() => funders.id, { onDelete: "cascade" }).notNull(),
  field: text("field").notNull(),
  value: jsonb("value"),
  sourceUrl: text("source_url").notNull(),
  model: text("model"),
  extractedAt: timestamp("extracted_at", { withTimezone: true }).defaultNow().notNull(),
});

export const scores = pgTable("scores", {
  id: serial("id").primaryKey(),
  funderId: integer("funder_id").references(() => funders.id, { onDelete: "cascade" }).notNull(),
  /** Set for government listings: the ranked unit is the opportunity, not the agency. */
  opportunityId: integer("opportunity_id").references(() => opportunities.id, { onDelete: "cascade" }),
  refreshId: integer("refresh_id").references(() => refreshes.id),
  total: integer("total"),
  isShortlisted: boolean("is_shortlisted").default(false).notNull(),
  band: text("band"),
  confidence: text("confidence"),
  components: jsonb("components").notNull(),
  gates: jsonb("gates").notNull(),
  reason: text("reason"),
  reasonSourceUrl: text("reason_source_url"),
  excludedReason: text("excluded_reason"),
  createdAt: createdAt(),
});

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  funderId: integer("funder_id").references(() => funders.id, { onDelete: "cascade" }).notNull(),
  action: decisionAction("action").notNull(),
  snoozeUntil: date("snooze_until"),
  createdAt: createdAt(),
});

export const pipelineItems = pgTable("pipeline_items", {
  id: serial("id").primaryKey(),
  funderId: integer("funder_id").references(() => funders.id, { onDelete: "cascade" }).notNull(),
  opportunityId: integer("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
  stage: stage("stage").default("prospect").notNull(),
  amountAsked: money("amount_asked"),
  amountAwarded: money("amount_awarded"),
  deadline: date("deadline"),
  awardedOn: date("awarded_on"),
  notes: text("notes"),
  /** Demo sample data (PRD: no CRM yet). Shown with a "Sample" badge; clearable in Settings. */
  isSample: boolean("is_sample").default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  pipelineItemId: integer("pipeline_item_id")
    .references(() => pipelineItems.id, { onDelete: "cascade" })
    .notNull(),
  amount: money("amount").notNull(),
  receivedOn: date("received_on").notNull(),
});

/** Officers/trustees already published in public filings. Never contact details. */
export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  funderId: integer("funder_id").references(() => funders.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  title: text("title"),
  sourceFilingId: integer("source_filing_id").references(() => filings.id, { onDelete: "set null" }),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  kind: notificationKind("kind").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  dedupeKey: text("dedupe_key").unique(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const refreshes = pgTable("refreshes", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").default("running").notNull(),
  fundersSeen: integer("funders_seen").default(0).notNull(),
  fundersProcessed: integer("funders_processed").default(0).notNull(),
  fundersSkippedCached: integer("funders_skipped_cached").default(0).notNull(),
  tokensIn: integer("tokens_in").default(0).notNull(),
  tokensOut: integer("tokens_out").default(0).notNull(),
  estCostUsd: numeric("est_cost_usd", { precision: 10, scale: 4, mode: "number" }).default(0).notNull(),
  sourceErrors: jsonb("source_errors").default([]).notNull(),
  message: text("message"),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  notifyEmail: text("notify_email"),
  alertKinds: jsonb("alert_kinds").$type<string[]>().default(["new_match", "open_call", "deadline"]).notNull(),
  reminderDays: jsonb("reminder_days").$type<number[]>().default([14, 7, 2]).notNull(),
  snoozeDays: integer("snooze_days").default(30).notNull(),
  tokenCapPerRefresh: integer("token_cap_per_refresh").default(2_000_000).notNull(),
  weights: jsonb("weights").$type<Record<string, number> | null>(),
  trustBannerDismissed: boolean("trust_banner_dismissed").default(false).notNull(),
});

export const drafts = pgTable("drafts", {
  id: serial("id").primaryKey(),
  funderId: integer("funder_id").references(() => funders.id, { onDelete: "cascade" }).notNull(),
  body: text("body").notNull(),
  sourceMaterial: jsonb("source_material").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ---------- Authentication (Better Auth). Staff accounts only: never donor, student or volunteer data. ---------- */

export const userRole = pgEnum("user_role", ["admin", "staff"]);
const authTs = (name: string) => timestamp(name, { withTimezone: true }).defaultNow().notNull();

export const authUsers = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  /** Server-assigned only (Better Auth `input: false`); never accepted from a client request. */
  role: userRole("role").default("staff").notNull(),
  createdAt: authTs("created_at"),
  updatedAt: authTs("updated_at"),
});

export const authSessions = pgTable("auth_session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").references(() => authUsers.id, { onDelete: "cascade" }).notNull(),
  createdAt: authTs("created_at"),
  updatedAt: authTs("updated_at"),
});

export const authAccounts = pgTable("auth_account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").references(() => authUsers.id, { onDelete: "cascade" }).notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  /** Hash produced by Better Auth (scrypt). The app never hashes or compares passwords itself. */
  password: text("password"),
  createdAt: authTs("created_at"),
  updatedAt: authTs("updated_at"),
});

export const authVerifications = pgTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: authTs("created_at"),
  updatedAt: authTs("updated_at"),
});

/** Sign-in / reset rate limits shared across server instances. */
export const authRateLimits = pgTable("auth_rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ---------- Human approval of AI-generated content (separate from funder approve/snooze/reject decisions) ---------- */

export const approvalStatus = pgEnum("approval_status", ["draft", "pending_approval", "approved", "changes_requested", "rejected"]);

export const contentApprovals = pgTable(
  "content_approvals",
  {
    id: serial("id").primaryKey(),
    /** The AI draft this was created from. One approval item per draft row. */
    draftId: integer("draft_id").references(() => drafts.id, { onDelete: "set null" }),
    funderId: integer("funder_id").references(() => funders.id, { onDelete: "cascade" }).notNull(),
    contentType: text("content_type").notNull(),
    title: text("title").notNull(),
    subject: text("subject").default("").notNull(),
    body: text("body").notNull(),
    sourceMaterial: jsonb("source_material").$type<string[]>().default([]).notNull(),
    factsToVerify: jsonb("facts_to_verify").$type<string[]>().default([]).notNull(),
    status: approvalStatus("status").default("draft").notNull(),
    /** Bumped on every content edit; reviews must name the version they read. */
    version: integer("version").default(1).notNull(),
    contentHash: text("content_hash").notNull(),
    createdById: text("created_by_id").references(() => authUsers.id, { onDelete: "set null" }),
    submittedById: text("submitted_by_id").references(() => authUsers.id, { onDelete: "set null" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedById: text("reviewed_by_id").references(() => authUsers.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNotes: text("review_notes"),
    /** Hash + version of the exact text that was approved. Cleared when the content changes. */
    approvedHash: text("approved_hash"),
    approvedVersion: integer("approved_version"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("content_approvals_draft_id_unique").on(t.draftId)],
);

/** Append-only audit trail: who did what, to which version, when. */
export const approvalEvents = pgTable("approval_events", {
  id: serial("id").primaryKey(),
  approvalId: integer("approval_id").references(() => contentApprovals.id, { onDelete: "cascade" }).notNull(),
  action: text("action").notNull(),
  fromStatus: approvalStatus("from_status"),
  toStatus: approvalStatus("to_status"),
  actorId: text("actor_id").references(() => authUsers.id, { onDelete: "set null" }),
  notes: text("notes"),
  version: integer("version").notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: createdAt(),
});
