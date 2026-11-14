# Tech-Moms Funder Finder

Finds and ranks grants and sponsorships likely to fund Tech-Moms, using only free public data, and tracks the funding pipeline. Built for Hack for Humanity (Nonprofit Support track).

- Product requirements: [`docs/PRD_HFH.pdf`](docs/PRD_HFH.pdf)
- Technical spec + **build status checklist**: [`docs/SPEC.md`](docs/SPEC.md) ← start here if you're picking up work
- Decisions for competition day: [`BACKLOG.md`](BACKLOG.md)

## Principles

Public data only · no personal data in the database, prompts or logs · AI finds, extracts and explains; a person decides · every fact links to its source.

## Local setup

Requires Node 20+. No Docker needed.

```bash
npm install
cp .env.example .env.local        # fill in ANTHROPIC_API_KEY etc.
npm run db:start                  # terminal 1: real Postgres on :5433 (embedded-postgres, data in data/pg)
npm run db:push                   # create tables
npm run db:seed                   # settings, corporate seeds, SAMPLE pipeline data
npm run ingest -- all             # load 990 snapshot + Grants.gov + score (~3 min, no AI)
npm run auth:create-user -- --email you@tech-moms.org --name "Your Name" --role admin   # first account (prints a temporary password)
npm run dev                       # terminal 2: http://localhost:3000 → sign in
```

## Sign-in, roles and approvals

- **Sign-in is required** for every page and API except `/login`, `/forgot-password`, `/reset-password`, `/api/auth/*` (Better Auth) and `/api/cron/*` (its own `CRON_SECRET`).
- **No public sign-up.** An admin creates accounts: `npm run auth:create-user -- --email … --name "…" --role admin|staff` (password from `AUTH_NEW_USER_PASSWORD`, or a random one printed once). Change a role with `--set-role staff`.
- **Roles:** `staff` create, edit and submit AI drafts. `admin` also approves / requests changes / rejects (never their own content), changes Settings, runs "Refresh now" and clears sample data.
- **Password reset** emails a 30-minute, single-use link via Resend (`RESEND_API_KEY`). Without a key, `npm run dev` prints the link in the server console; production logs nothing.
- **Approvals** (`/approvals`): AI drafts move Draft → Pending approval → Approved / Changes requested / Rejected. Editing approved content removes the approval. Every step is recorded with the person, time, version and content hash. Approval never sends anything; "Open in my email app" is a separate confirmed step and is never offered for `[DEMO]` / `Sample` funders.
- Auth env vars: `BETTER_AUTH_SECRET` (required in production; `openssl rand -base64 32`), `BETTER_AUTH_URL` (public URL, used in reset links). See `.env.example`.

Prefer Docker? `docker compose up -d` also serves Postgres on :5433 with the same credentials.

## Data pipeline (local, heavy)

```bash
npx tsx scripts/ingest/peer-orgs.ts     # starter peer-org list → data/peer-orgs.json (review it!)
npx tsx scripts/ingest/scan-990pf.ts    # OPTIONAL: re-scan ~130k 990-PFs (~35 min). A snapshot is committed at data/pf-relevant.jsonl.gz
npm run ingest -- load                  # load scan results into Postgres (~3 min fresh DB; ~15 min reloading over existing data)
```

Sources: IRS e-file index (apps.irs.gov) + GivingTuesday 990 data lake public S3 mirror for individual XML filings, ProPublica Nonprofit Explorer API, Grants.gov search2 API. All free, no keys.

## AI and feature flags

AI is **off** unless `AI_ENABLED=true` is set (a key alone does nothing, so a personal key in your OS environment can't spend by accident). With AI off, everything still works from public filings; Utah pages and website open-call detection need AI.

Stretch features are off by default; turn on in `.env.local`:
`FLAG_BOARD_MEMBERS`, `FLAG_AI_DRAFT`, `FLAG_FULL_DASHBOARD`, `FLAG_WEIGHT_TUNING` (`=true`).

Tunable without code: scoring weights/keywords/bands (`src/config/scoring.ts`), Utah sources (`src/config/utah-sources.ts`), org facts (`src/config/org-profile.ts`), AI models (`AI_MODEL_*`).

## Tests

```bash
npm test                          # unit tests (scoring, gates, reason, 990-PF parser)
```

## Working on this repo

- Commit small, push often — the team picks up from `main` + the SPEC checklist.
- Conventional commits (`feat:`, `fix:`, `docs:` …).
- Anything needing a team decision → add to `BACKLOG.md`.
