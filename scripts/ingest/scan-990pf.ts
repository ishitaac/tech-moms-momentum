/**
 * Reverse lookup: scan every recent e-filed 990-PF and keep foundations that
 *   (a) are based in Utah / the Mountain West, or
 *   (b) paid grants to Utah recipients, or
 *   (c) paid grants to a peer org (data/peer-orgs.json, keep !== false).
 *
 * Sources: IRS e-file index CSVs (apps.irs.gov) + individual XML filings from the
 * GivingTuesday 990 data lake public S3 mirror. Resumable: re-run to continue.
 *
 * Usage:
 *   npx tsx scripts/ingest/scan-990pf.ts [--limit 500] [--concurrency 24] [--years 2024,2025]
 * Output: data/cache/pf-relevant.jsonl  (one parsed filing per line)
 */
import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { GEOGRAPHY } from "../../src/config/scoring";
import { normalizeOrgName } from "../../src/lib/irs/normalize";
import { parse990PF, type Parsed990PF } from "../../src/lib/irs/parse990pf";

const CACHE = "data/cache";
const OUT = `${CACHE}/pf-relevant.jsonl`;
const PROGRESS = `${CACHE}/scan-progress.txt`;
const ERRORS = `${CACHE}/scan-errors.txt`;
const INDEX_URL = (y: number) => `https://apps.irs.gov/pub/epostcard/990/xml/${y}/index_${y}.csv`;
const XML_URL = (oid: string) => `https://gt990datalake-rawdata.s3.amazonaws.com/EfileData/XmlFiles/${oid}_public.xml`;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;
const PROGRESS_EVERY = 500;

interface IndexRow {
  ein: string;
  name: string;
  taxPeriod: string;
  objectId: string;
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function ensureIndex(year: number): Promise<string> {
  const file = `${CACHE}/index_${year}.csv`;
  if (existsSync(file)) return file;
  console.log(`Downloading IRS index ${year}…`);
  const res = await fetch(INDEX_URL(year));
  if (!res.ok) throw new Error(`Index ${year}: HTTP ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

/** CSV: RETURN_ID,FILING_TYPE,EIN,TAX_PERIOD,SUB_DATE,TAXPAYER_NAME,RETURN_TYPE,DLN,OBJECT_ID,XML_BATCH_ID
 *  TAXPAYER_NAME may contain commas, so take fixed columns from both ends. */
function parseIndexLine(line: string): IndexRow | null {
  const cols = line.split(",");
  if (cols.length < 10) return null;
  const tail = cols.slice(-4); // RETURN_TYPE, DLN, OBJECT_ID, XML_BATCH_ID
  if (tail[0] !== "990PF") return null;
  return { ein: cols[2], taxPeriod: cols[3], name: cols.slice(5, -4).join(","), objectId: tail[2] };
}

async function latestPfFilings(years: number[]): Promise<IndexRow[]> {
  const byEin = new Map<string, IndexRow>();
  for (const y of years) {
    const file = await ensureIndex(y);
    const rl = createInterface({ input: createReadStream(file) });
    for await (const line of rl) {
      const row = parseIndexLine(line);
      if (!row) continue;
      const prev = byEin.get(row.ein);
      if (!prev || row.taxPeriod > prev.taxPeriod) byEin.set(row.ein, row);
    }
  }
  return [...byEin.values()];
}

function loadPeers(): Set<string> {
  const path = "data/peer-orgs.json";
  if (!existsSync(path)) return new Set();
  const list = JSON.parse(readFileSync(path, "utf8")) as { name: string; keep: boolean | null }[];
  return new Set(list.filter((p) => p.keep !== false).map((p) => normalizeOrgName(p.name)));
}

const REGION = new Set<string>([GEOGRAPHY.homeState, ...GEOGRAPHY.region]);

function relevance(pf: Parsed990PF, peers: Set<string>): string[] {
  const reasons: string[] = [];
  if (pf.state && REGION.has(pf.state)) reasons.push(`based in ${pf.state}`);
  const utGrants = pf.grants.filter((g) => g.recipientState === GEOGRAPHY.homeState);
  if (utGrants.length) reasons.push(`${utGrants.length} grants to UT`);
  const peerHits = pf.grants.filter((g) => g.recipientName && peers.has(normalizeOrgName(g.recipientName)));
  if (peerHits.length) reasons.push(`peer grants: ${peerHits.map((g) => g.recipientName).join("; ")}`);
  return reasons;
}

async function fetchXml(oid: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(XML_URL(oid), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.status === 404) throw new Error("404 not in data lake");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (String(err).includes("404")) break;
    }
  }
  throw lastErr;
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const years = arg("years", "2024,2025").split(",").map(Number);
  const limit = Number(arg("limit", "0"));
  const concurrency = Number(arg("concurrency", "24"));

  const peers = loadPeers();
  const done = new Set(existsSync(PROGRESS) ? readFileSync(PROGRESS, "utf8").split("\n").filter(Boolean) : []);
  let rows = (await latestPfFilings(years)).filter((r) => !done.has(r.objectId));
  if (limit > 0) rows = rows.slice(0, limit);
  console.log(`${peers.size} peers · ${done.size} already scanned · ${rows.length} to scan`);

  let next = 0;
  let scanned = 0;
  let kept = 0;
  let failed = 0;
  const started = Date.now();

  async function worker() {
    while (next < rows.length) {
      const row = rows[next++];
      try {
        const pf = parse990PF(await fetchXml(row.objectId));
        const reasons = relevance(pf, peers);
        if (reasons.length) {
          appendFileSync(OUT, JSON.stringify({ objectId: row.objectId, reasons, ...pf }) + "\n");
          kept++;
        }
      } catch (err) {
        failed++;
        appendFileSync(ERRORS, `${row.objectId}\t${row.ein}\t${String(err).slice(0, 120)}\n`);
      }
      appendFileSync(PROGRESS, row.objectId + "\n");
      scanned++;
      if (scanned % PROGRESS_EVERY === 0) {
        const rate = scanned / ((Date.now() - started) / 1000);
        const etaMin = Math.round((rows.length - scanned) / rate / 60);
        console.log(`${scanned}/${rows.length} · kept ${kept} · failed ${failed} · ${rate.toFixed(1)}/s · ETA ${etaMin} min`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`Done. scanned ${scanned}, kept ${kept}, failed ${failed}. Output: ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
