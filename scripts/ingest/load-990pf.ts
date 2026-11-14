/**
 * Loads data/cache/pf-relevant.jsonl (from scan-990pf.ts) into Postgres.
 * Falls back to the committed snapshot data/pf-relevant.jsonl.gz (scan of 2026-11-13),
 * so teammates can load without re-running the ~35 min scan.
 * Idempotent: upserts funders by EIN and replaces that funder's filing/grants/people.
 *
 * Usage: npm run ingest -- load
 */
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../../src/db";
import type { Parsed990PF } from "../../src/lib/irs/parse990pf";

const INPUT = "data/cache/pf-relevant.jsonl";
const SNAPSHOT = "data/pf-relevant.jsonl.gz";
const GRANT_BATCH = 500;
const FAMILY = /\bFAMILY\b/i;
const CORPORATE = /\b(CORPORATE|COMPANY|CORP)\b.*\bFOUNDATION\b|\bFOUNDATION\b.*\b(INC\.? CORPORATE)\b/i;

type Row = Parsed990PF & { objectId: string; reasons: string[] };

export const propublicaUrl = (ein: string) => `https://projects.propublica.org/nonprofits/organizations/${ein}`;
export const xmlUrl = (oid: string) => `https://gt990datalake-rawdata.s3.amazonaws.com/EfileData/XmlFiles/${oid}_public.xml`;

function funderType(name: string): "family_foundation" | "corporate" | "foundation" {
  if (FAMILY.test(name)) return "family_foundation";
  if (CORPORATE.test(name)) return "corporate";
  return "foundation";
}

function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

async function loadOne(row: Row): Promise<void> {
  const values = {
    ein: row.ein,
    name: titleCase(row.name),
    type: funderType(row.name),
    city: row.city ? titleCase(row.city) : null,
    state: row.state,
    website: row.website,
    latestFilingYear: row.taxYear,
    acceptsUnsolicited: row.preselectedOnly === null ? null : !row.preselectedOnly,
    purpose: row.application?.restrictions ?? null,
    contentHash: row.objectId,
    updatedAt: new Date(),
  };

  await db.transaction(async (tx) => {
    const [funder] = await tx
      .insert(schema.funders)
      .values(values)
      .onConflictDoUpdate({ target: schema.funders.ein, set: values })
      .returning({ id: schema.funders.id });

    await tx.delete(schema.filings).where(eq(schema.filings.funderId, funder.id));
    await tx.delete(schema.people).where(eq(schema.people.funderId, funder.id));

    const [filing] = await tx
      .insert(schema.filings)
      .values({
        funderId: funder.id,
        taxYear: row.taxYear,
        form: "990PF",
        sourceUrl: propublicaUrl(row.ein),
        pdfUrl: xmlUrl(row.objectId),
        totalGiving: row.totalGiving,
        totalAssets: row.totalAssets,
      })
      .returning({ id: schema.filings.id });

    const grants = row.grants.map((g) => ({
      funderId: funder.id,
      filingId: filing.id,
      recipientName: g.recipientName ?? "Individual recipient (name withheld)",
      recipientCity: g.recipientCity,
      recipientState: g.recipientState,
      amount: g.amount,
      purpose: g.purpose,
    }));
    for (let i = 0; i < grants.length; i += GRANT_BATCH) {
      await tx.insert(schema.grantsMade).values(grants.slice(i, i + GRANT_BATCH));
    }

    if (row.officers.length) {
      await tx.insert(schema.people).values(
        row.officers.map((o) => ({ funderId: funder.id, name: titleCase(o.name), title: o.title, sourceFilingId: filing.id })),
      );
    }

    // Application info from the 990-PF is free evidence for the access component.
    if (row.application) {
      await tx
        .delete(schema.extractedFields)
        .where(and(eq(schema.extractedFields.funderId, funder.id), eq(schema.extractedFields.field, "application_info")));
      await tx.insert(schema.extractedFields).values({
        funderId: funder.id,
        field: "application_info",
        value: row.application,
        sourceUrl: propublicaUrl(row.ein),
        model: null,
      });
    }
  });
}

export async function load990pf(): Promise<number> {
  let input: NodeJS.ReadableStream;
  if (existsSync(INPUT)) input = createReadStream(INPUT);
  else if (existsSync(SNAPSHOT)) {
    console.log(`Using committed snapshot ${SNAPSHOT}`);
    input = createReadStream(SNAPSHOT).pipe(createGunzip());
  } else throw new Error(`${INPUT} not found — run scan-990pf.ts first`);
  let n = 0;
  const rl = createInterface({ input });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      await loadOne(JSON.parse(line) as Row);
      n++;
      if (n % 250 === 0) console.log(`  loaded ${n}`);
    } catch (err) {
      console.warn(`  skip line: ${String(err).slice(0, 160)}`);
    }
  }
  return n;
}
