import {
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
  /** Signed-in user who generated or saved this draft (null for drafts made before sign-in existed). */
  createdBy: text("created_by").references(() => authUsers.id, { onDelete: "set null" }),
});

/* ---------- Authentication (Better Auth; tables named auth_* to stay clear of app data) ---------- */

export const authUsers = pgTable("auth_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  /** "admin" or "staff" (Better Auth admin plugin). */
  role: text("role").default("staff"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const authSessions = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").references(() => authUsers.id, { onDelete: "cascade" }).notNull(),
  impersonatedBy: text("impersonated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const authAccounts = pgTable("auth_accounts", {
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
  /** Hashed by Better Auth (scrypt). Never plain text. */
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const authVerifications = pgTable("auth_verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ---------- Human approval of AI-generated content ---------- */

export const reviewStatus = pgEnum("review_status", ["draft", "pending_approval", "approved", "changes_requested", "rejected"]);

/** Current review state of one AI-generated draft. One row per draft (unique), so a draft can't be queued twice. */
export const contentReviews = pgTable(
  "content_reviews",
  {
    id: serial("id").primaryKey(),
    draftId: integer("draft_id").references(() => drafts.id, { onDelete: "cascade" }).notNull(),
    /** "grant_draft" | "outreach" — read from the draft's source material. */
    contentType: text("content_type").notNull(),
    title: text("title").notNull(),
    status: reviewStatus("status").default("draft").notNull(),
    /** sha256 of the whitespace-normalised body that was submitted / reviewed. */
    contentHash: text("content_hash").notNull(),
    submittedBy: text("submitted_by").references(() => authUsers.id, { onDelete: "set null" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by").references(() => authUsers.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNotes: text("review_notes"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("content_reviews_draft_id_unique").on(t.draftId)],
);

/** Append-only audit trail of every review action. */
export const reviewEvents = pgTable("review_events", {
  id: serial("id").primaryKey(),
  reviewId: integer("review_id").references(() => contentReviews.id, { onDelete: "cascade" }).notNull(),
  action: text("action").notNull(),
  fromStatus: reviewStatus("from_status"),
  toStatus: reviewStatus("to_status").notNull(),
  contentHash: text("content_hash").notNull(),
  actorId: text("actor_id").references(() => authUsers.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: createdAt(),
});
