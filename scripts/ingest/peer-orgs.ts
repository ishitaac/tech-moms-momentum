/**
 * Generates a STARTER list of peer organizations: Utah / Mountain West nonprofits
 * whose funders are likely to fund Tech-Moms. The team prunes data/peer-orgs.json
 * by hand before the final scan (see BACKLOG.md).
 *
 * Usage: npx tsx scripts/ingest/peer-orgs.ts
 */
import { writeFileSync } from "node:fs";
import { normalizeEin } from "../../src/lib/irs/normalize";

const API = "https://projects.propublica.org/nonprofits/api/v2/search.json";
const STATES = ["UT"];
const QUERIES = [
  "tech moms",
  "women tech",
  "women in technology",
  "girls code",
  "workforce",
  "coding",
  "career",
  "women",
  "mothers",
  "digital",
  "stem",
  "returnship",
  "job training",
];
/** NTEE major groups that fit: B (education), J (employment), W (public benefit), S (community), P (human services). */
const ALLOWED_NTEE = /^[BJPSWO]/;
const REQUEST_DELAY_MS = 400;

interface PeerOrg {
  ein: string;
  name: string;
  city: string | null;
  state: string;
  ntee: string | null;
  matchedQuery: string;
  /** Set by a human reviewer: true = keep, false = drop. */
  keep: boolean | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(q: string, state: string): Promise<PeerOrg[]> {
  const url = `${API}?q=${encodeURIComponent(q)}&state%5Bid%5D=${state}`;
  const res = await fetch(url, { headers: { "User-Agent": "funder-finder-hackathon" } });
  if (!res.ok) {
    console.warn(`  skip "${q}" ${state}: HTTP ${res.status}`);
    return [];
  }
  const body = (await res.json()) as { organizations?: Array<Record<string, unknown>> };
  return (body.organizations ?? [])
    .filter((o) => !o.ntee_code || ALLOWED_NTEE.test(String(o.ntee_code)))
    .map((o) => ({
      ein: normalizeEin(o.ein as number),
      name: String(o.name),
      city: (o.city as string) ?? null,
      state: String(o.state),
      ntee: (o.ntee_code as string) ?? null,
      matchedQuery: q,
      keep: null,
    }));
}

async function main() {
  const byEin = new Map<string, PeerOrg>();
  // Tech-Moms itself: any foundation that granted to it is a known funder.
  byEin.set("863417178", {
    ein: "863417178",
    name: "Tech-moms",
    city: "Bountiful",
    state: "UT",
    ntee: "B60",
    matchedQuery: "self",
    keep: true,
  });

  for (const state of STATES) {
    for (const q of QUERIES) {
      const orgs = await search(q, state);
      for (const o of orgs) if (!byEin.has(o.ein)) byEin.set(o.ein, o);
      console.log(`"${q}" ${state}: ${orgs.length} (total ${byEin.size})`);
      await sleep(REQUEST_DELAY_MS);
    }
  }

  const list = [...byEin.values()].sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync("data/peer-orgs.json", JSON.stringify(list, null, 2) + "\n");
  console.log(`Wrote ${list.length} peer orgs to data/peer-orgs.json — review and set keep:false on bad matches.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
