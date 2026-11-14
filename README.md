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
npm run dev                       # terminal 2: http://localhost:3000
```

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
