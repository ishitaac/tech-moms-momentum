# Tech-Moms Funder Finder — Build Spec

Source of truth for product intent: [`docs/PRD_HFH.pdf`](./PRD_HFH.pdf) (PRD v2).
This spec records the **technical decisions** made on 2026-11-13 (pre-build day) so anyone on the team can pick up the work.
Open items go in [`BACKLOG.md`](../BACKLOG.md), not here.

## 0. Context

- Pre-building on 2026-11-13. Competition day gives **3.5 hours** to adapt to the official prompt.
- Everything likely to change tomorrow is kept **configurable**: AI provider, scoring weights/keywords, data sources, stretch features (flags).
- Robbyn's input is already in the PRD; no further access assumed.

## 1. Stack

| Concern | Choice | Notes |
|---|---|---|
| App | Next.js 16 (App Router), TypeScript, Tailwind v4 | Read `node_modules/next/dist/docs/` before using new APIs (see AGENTS.md) |
| DB | Postgres (Docker locally, Neon/Supabase on deploy) | Drizzle ORM + `postgres` driver |
| AI | Vercel AI SDK (`ai`) behind `src/lib/ai/provider.ts` | Default Anthropic: small model for extraction, mid model for explanations. Swap via env `AI_PROVIDER` / `AI_MODEL_*` |
| Email | Resend | Without a verified domain, sends only to the account owner's address |
| Scheduling | Vercel Cron → `/api/cron/refresh` (daily, no-op unless 14 days elapsed) | Light delta only |
| Heavy ingest | Local TS scripts (`scripts/`, run with `tsx`) writing to Postgres | 990 XML parsing never runs on Vercel |
| Charts | Recharts | |
| Kanban | `@dnd-kit/core` | Select-to-move fallback for accessibility |
| Tests | Vitest, **core logic only** | Gates, scoring, bands, confidence, 990 parsing, ICS. Deliberate hackathon exception to the 80% rule |
| Auth | None (single-tenant demo) | Add shared-password gate if deployed publicly — see backlog |

## 2. Architecture

```
            ┌─────────────── local, one-time / occasional ───────────────┐
IRS / GivingTuesday 990 XML ─► scripts/ingest-990.ts ─► funders, grants_made, people, filings
ProPublica API ───────────────► scripts/ingest-propublica.ts ┘
peer-orgs.json (reviewed) ────► reverse lookup: who funded Utah + peer orgs
            └────────────────────────────────────────────────────────────┘
                                   │ Postgres
            ┌──── Vercel Cron, every 14 days (light delta) ──────┐
Grants.gov API ─► adapters/grants-gov ─┐
Utah URL list ─► adapters/utah-pages ──┼─► opportunities
Funder websites ► adapters/website ────┘   (open calls, deadlines, route)
            changed rows only ─► AI extract ─► score ─► reason ─► notifications + email
            └────────────────────────────────────────────────────┘
                                   │
                   Next.js UI: list · drawer · pipeline · dashboard · notifications · settings
```

### Source adapters (`src/lib/sources/*`)
Every source implements one interface so sources are pluggable and a failure in one never blocks a refresh:

```ts
interface SourceAdapter {
  id: string;                 // 'propublica' | 'irs-990' | 'grants-gov' | 'utah-pages' | 'website'
  label: string;              // shown on the Sources panel
  fetch(ctx): Promise<SourceResult>; // never throws; returns { items, errors, fetchedAt }
}
```
Registered in `src/config/sources.ts` (enable/disable per source).

## 3. Data model (Drizzle, `src/db/schema.ts`)

| Table | Key columns |
|---|---|
| `funders` | id, ein (nullable for gov), name, type (`state`,`federal`,`corporate`,`foundation`,`family_foundation`), state, website, ntee, latest_filing_year, accepts_unsolicited (bool/null), content_hash, updated_at |
| `filings` | id, funder_id, tax_year, form (`990`,`990PF`,`990EZ`), source_url, pdf_url, total_giving |
| `grants_made` | id, funder_id, filing_id, recipient_name, recipient_ein, recipient_state, amount, purpose |
| `opportunities` | id, funder_id, title, source_url, is_open (`open`/`unknown`), deadline, route (`loi`,`direct`,`unknown`), award_min, award_max, eligibility, geography, raw_text_hash |
| `extracted_fields` | id, funder_id, field, value, source_url, model, extracted_at — **every shown fact has a source_url** |
| `scores` | id, funder_id, refresh_id, total, band, confidence, components (jsonb: per component {score, weight, evidence, source_url}), gates (jsonb), reason, excluded_reason |
| `decisions` | id, funder_id, action (`approve`,`snooze`,`reject`), snooze_until, created_at |
| `pipeline_items` | id, funder_id, opportunity_id, stage (`prospect`,`loi`,`submitted`,`awarded`,`declined`), amount_asked, amount_awarded (= committed), deadline |
| `payments` | id, pipeline_item_id, amount, received_on (= received) |
| `people` | id, funder_id, name, title, source_filing_id — officers/trustees from public filings only, **no contact details** |
| `notifications` | id, kind (`new_match`,`open_call`,`deadline`), title, body, link, read_at, created_at |
| `refreshes` | id, started_at, finished_at, funders_seen, funders_processed, funders_skipped_cached, tokens_in, tokens_out, est_cost_usd, source_errors (jsonb) |
| `settings` | singleton: notify_email, alert_kinds, reminder_days (default [14,7,2]), snooze_days (default 30), token_cap_per_refresh, weights override (jsonb) |
| `drafts` | id, funder_id, body, source_material (jsonb), updated_at — US-10, flagged |

Privacy: no table stores donor, student or staff personal data. `people` holds only officer/trustee names + titles already published in filings.

## 4. Candidate universe (reverse lookup)

1. `data/peer-orgs.json`: Tech-Moms + Utah/Mountain-West workforce, women-in-tech, and tech-education nonprofits. **Generated starter list, team prunes it.**
2. Parse 990-PF grant schedules (Part XIV / `GrantOrContributionPdDurYrGrp`) from IRS/GivingTuesday XML for recent tax years.
3. Candidates = foundations that granted to (a) any peer org, or (b) Utah recipients with total giving above a floor.
4. Add seeds: Adobe, Meta, Weave, Ancestry (corporate foundations where they file; CSR page otherwise) + known funders.
5. Cheap filters (gates, keyword prefilter) → shortlist of **100–150** for AI extraction and scoring.

Government: Grants.gov search (keywords + eligibility = nonprofits) and a curated Utah URL list (`src/config/utah-sources.ts`) read by the AI.

Websites: plain `fetch` of homepage + likely grants/apply pages → `html-to-text` → small model. JS-only or blocked sites → `unknown`. Respect robots.txt and each site's terms.

## 5. Fit score

Config lives in `src/config/scoring.ts` (weights, keywords, bands, thresholds). Pure functions in `src/lib/scoring/` with unit tests.

**Gates** (fail → hidden from main list, shown in "Excluded" with the reason):
- Active: grants in the last 1–2 filing years (foundations). Government: needs a live listing instead.
- Open to new asks: not "preselected organizations only" (990-PF checkbox — verify field in XML).

**Components** (each 0–1, or `null` when there's no evidence):

| Component | Weight | Measure |
|---|---|---|
| mission | 0.35 | 50% keyword/phrase match + 50% AI anchored read (0–3 → 0–1) |
| women | 0.15 | keywords + past grantees tied to women/girls/moms/caregivers |
| geography | 0.20 | share of grant dollars to UT (full), Mountain West (partial); gov: eligible region |
| history | 0.20 | recent volume, typical grant size near $5K–$30K, peer-grantee similarity; gov: award size vs. sweet spot |
| access | 0.10 | open call, accepts unsolicited, LOI route, warm-intro path |

- **Missing evidence**: component excluded; remaining weights renormalized. `total = round(100 × Σ(wᵢ·sᵢ) / Σwᵢ)` over non-null components.
- **Confidence** = (# components with evidence) / 5 → `high` ≥ 0.8, `medium` ≥ 0.6, else `low`.
- **Bands**: Strong ≥ 75, Worth a look 55–74, Long shot < 55. **Strong requires ≥ 3 components with evidence**; otherwise capped at Worth a look.
- Label is always **"fit score"**, never odds/probability.
- **Reason line**: a template built from the top 2 drivers, with numbers and a source link; the AI may rephrase it but must not add facts (validated: numbers in the output must appear in the input). Missing evidence → "unknown".
- Weight-tuning UI (flagged) writes `settings.weights` and re-ranks without re-running AI.

## 6. Refresh & notifications

- Cron daily → runs if ≥ 14 days since last successful refresh (or manual "Refresh now" in Settings).
- Delta only: skip funders whose `content_hash` hasn't changed; cache extracted fields.
- Token cap per refresh (`settings.token_cap_per_refresh`); stop cleanly with a message when hit.
- Each refresh writes a `refreshes` row → AI usage panel (processed, skipped-by-cache, tokens, est. $).
- Notifications: new matches, new open calls, deadlines at 14/7/2 days. In-app page (newest first, read/unread) + one summary email via Resend.
- ICS: per-deadline "Add to calendar" + full export (`/api/calendar.ics`).

## 7. Review & pipeline

- Approve → creates `pipeline_items` in `prospect`. Snooze → hidden until `snooze_until` (default 30 days). Reject → hidden at next refresh unless a new open call or a large change in giving (> 50% change in total giving — tunable).
- Board: Prospect · LOI · Submitted · Awarded · Declined, $ total per stage, drag or select to move, editable asked/awarded.
- Committed = Σ `amount_awarded` on Awarded items. Received = Σ `payments.amount`. Chart by month.

## 8. UI

- Tech-Moms branded (colors/logo from their public site; fall back to neutral + one accent).
- Home = **ranked list**: filters (type, band, open call, search), "New since last refresh" strip, dense table; row click → right **drawer** (score breakdown, reason, sources with filing year, open call/deadline/route, people [flag], actions approve/snooze/reject, draft [flag]).
- Trust banner on first visit: "Public data only · No personal data · AI assists, you decide" + sources list.
- Pages: `/` list · `/excluded` · `/pipeline` · `/dashboard` · `/notifications` · `/settings` (email, alerts, reminders, snooze, weights [flag], AI usage, sources & last refreshed).
- Usable by a non-technical person within 5 minutes; settings on one screen.

## 9. Feature flags (`src/config/flags.ts`, env-overridable)

| Flag | Story | Default |
|---|---|---|
| `boardMembers` | US-9 | off |
| `aiDraft` | US-10 | off (always opt-in per click even when on) |
| `fullDashboard` | dashboard Should/Stretch reports | off |
| `weightTuning` | sliders in Settings | off |

## 10. Build plan & status

Keep this checklist current and push after each item so the team can resume from here.

Status as of end of pre-build (2026-11-13). 94 unit tests passing (`npm test`), typecheck + lint clean.

- [x] 0. Spec, backlog, Next.js scaffold, private GitHub repo + collaborators
- [x] 1. DB schema + Postgres (embedded via `npm run db:start`, Docker optional) + Drizzle `db:push` + seed script
- [x] 2. Config: scoring, flags, sources (`utah-sources.ts`), AI provider abstraction (`AI_ENABLED` opt-in)
- [x] 3. Scoring engine (gates, components, renormalize, bands, confidence) + tests — **calibrated** against known Tech-Moms funders (BACKLOG #13)
- [x] 4. Ingestion: 990-PF XML parser (+ tests), peer-org list, full reverse-lookup scan (130,710 filings → 10,569 foundations loaded)
- [x] 5. Grants.gov + Utah DWS pages + website adapters; AI extraction with verbatim-quote guardrails; cost logging
- [x] 6. UI: ranked list + side panel + excluded view + trust banner
- [x] 7. Review actions (approve/snooze/reject) → pipeline board (drag + select) + committed vs received chart
- [x] 8. Notifications page, Resend email, deadline reminders, ICS export (`/api/calendar/all`), Settings + AI usage panel
- [x] 9. Cron refresh route `/api/cron/refresh` (daily check, runs every 14 days, token cap) + `vercel.json`
- [x] 10. Flagged stretch built: board members, AI draft, full dashboard, weight tuning (all off by default)
- [ ] 11. Demo prep: decide flags + AI key (BACKLOG #1, #17), fill `org-profile.ts`, Candid spot-check validation, rehearse
- [ ] 12. Hosting (team, after hackathon — BACKLOG #19)

### What is NOT verified yet
- AI draft (US-10) and weight-tuning UI were typechecked but not clicked through in a browser (flags off).
- Email sending (no Resend key configured).
- E2E browser tests don't exist (unit tests cover scoring, parsing, filters, pipeline math, ICS).

## 11. Running locally

See README.md.
