# Backlog — decide on competition day

Items that came up during the pre-build and need a team decision. Add new ones at the bottom with a date and who raised it.
Format: **Item** — context · options · recommendation (if any).

## Open

1. **Which stretch flags to turn on for the demo** — all four are being pre-built (board members, AI draft, full dashboard, weight tuning). Turning them all on may crowd a ~5 min demo. Decide once the official prompt is known. *Rec:* weight tuning + board members (both reinforce "Robbyn stays in control").
2. **AI provider** — defaulting to Claude (Haiku-class for extraction, Sonnet-class for explanations) via the Vercel AI SDK. Switch if sponsor credits or the prompt favour another provider (`AI_PROVIDER` env).
3. **Resend sender domain** — without a verified domain, emails only reach the Resend account owner. Fine for the demo; decide whose account/domain to use long-term.
4. **Hosting/DB ownership after the hackathon** — PRD open question. Whose Vercel / Neon accounts, and does Tech-Moms take them over?
5. **Auth** — ~~none for the demo~~ Implemented on `feature/auth-approvals-techmoms-navigation` (Better Auth, email/password, admin-created accounts, admin/staff roles). Decide who is the first admin and set `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` in Vercel.
6. **Peer-org list review** — `data/peer-orgs.json` is generated; someone should prune it before the final ingest (it drives the candidate universe).
7. **"Large change in giving" threshold** for un-hiding rejected funders — set at 50% change in total giving. Confirm.
8. **Repo lives inside OneDrive** — `node_modules` and `.next` under OneDrive sync can be slow or lock files on Windows. Consider excluding the folder from sync or cloning outside OneDrive.
9. **Reverse-lookup breadth** (2026-11-13, Claude) — "any grant to a Utah recipient" keeps ~7% of all 990-PFs (thousands of foundations, many giving to churches/universities). The cheap shortlist filter (mission keywords on grant purposes, sweet-spot grant sizes, Utah $) narrows this to 100–150 before AI. Decide whether to tighten the scan criteria.
10. **Docker Desktop hung on the build laptop** (2026-11-13) — the engine never started (`docker desktop status: stopped`, won't stop cleanly). Local dev switched to `npm run db:start` (embedded-postgres, port 5433). A Windows Postgres service already occupies 5432 on that machine. Nothing to decide unless someone prefers Docker.
11. **Production DB** — pick Neon or Supabase (free tier) for the Vercel deploy and run `db:push` + `ingest load` against it.
12. **Federal grants are mostly poor fits** (2026-11-13, Claude) — after filtering, Grants.gov yields ~10–15 nonprofit-eligible workforce listings, almost all with $150K+ awards (far above the $5K–$30K sweet spot). They will mostly band as "Long shot", which matches Robbyn's experience (1 national win in 10–20). Consider demoing federal as "watch list" and leaning on Utah state + pass-through + foundations for the ranked list.
13. **Score calibration — please review** (2026-11-13, Claude). Checked against the 4 foundations whose 990-PFs show grants to Tech-Moms (Sorenson Legacy, Kahlert, Ashton Family, Larry H. Miller & Gail Miller). Changes made:
    - Mission & women now use the *share* of past grants that match (big national funders were winning on keyword volume).
    - Geography: Utah dollars dominate; Mountain West without Utah is partial credit (0.4).
    - "Boys & Girls Club" no longer counts as a women/girls signal.
    - A foundation that has granted to Tech-Moms is never gated out (Kahlert and LHM tick "preselected only" yet fund Tech-Moms) and is labelled "Past funder".
    - Bands recalibrated from PRD 75/55 to **Strong ≥ 50 / Worth a look ≥ 35** — without the AI mission read, the 99th percentile score is 45. Known funders rank 26–43 of ~2,000 (top 2%) and band "Worth a look". Revisit once AI is on (mission scores will rise).
    - **Decision needed:** should "preselected organizations only" exclude funders at all? Two real Tech-Moms funders tick it. Option: show them as "Invitation only — needs warm intro" instead of excluding.
14. **OneDrive breaks hot reload** (2026-11-13, Claude) — on the build laptop, new files weren't picked up by Tailwind/Turbopack until `npm run dev` was restarted (missing CSS classes). If styles look broken after adding a file, restart dev. Strong reason to clone outside OneDrive (see #8).
15. **Tech-Moms program facts for AI drafts** — `src/config/org-profile.ts` only has what's in the PRD. Fill in public facts (cohort sizes, outcomes, program names) before demoing US-10, or the draft will contain [placeholders].
16. **"AI provider does not train on our data"** is stated in the trust banner. True for the Anthropic API by default; re-check if the provider changes tomorrow.
17. **AI requires explicit opt-in: `AI_ENABLED=true`** (2026-11-13, Claude). The build laptop has a personal `ANTHROPIC_API_KEY` in the Windows user environment, and OS env vars override `.env.local` (both for `tsx --env-file` and Next.js). One test refresh therefore ran real AI calls on that key: 26 funder websites read, 261,657 tokens, est. $1.02 at list prices (see Settings → AI usage). Now a key alone does nothing. **Decide:** whose key/account to use for the demo; set `AI_ENABLED=true` + that key in `.env.local` (and remove or override the OS-level key if it shouldn't be used).
18. **Refresh runtime on Vercel** — website reading now runs 6 at a time (~150 shortlisted funders ≈ 8–10 min with AI on). That exceeds default serverless function limits. When hosting, either raise the function max duration for `/api/cron/refresh`, move refresh to a GitHub Action / Vercel Workflow, or run it locally. Without AI the refresh takes ~45 s.
19. **Hosting** — the team hosts after the hackathon (not done in pre-build). Needs: Postgres URL (Neon/Supabase), `db:push`, load the 990 data (`npm run ingest -- load` against prod DB, or `pg_dump` the local DB), env vars from `.env.example`, `CRON_SECRET`, and `vercel.json` cron is already configured.
20. **Calendar subscriptions need sign-in now** (2026-11-14, Claude) — `/api/calendar/*` is behind sign-in, so downloading the .ics from the app still works, but pasting the URL into Google/Outlook as a *subscription* won't, because those clients don't send the session cookie. If subscriptions are wanted, add per-user secret calendar tokens.
21. **Self-approval** (2026-11-14, Claude) — an admin can currently approve a draft they submitted (needed while there's only one admin). Decide whether to require a second admin once the team has two.
