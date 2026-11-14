/**
 * Runs a real local Postgres server without Docker (embedded-postgres).
 * Keep this running in its own terminal: `npm run db:start`. Ctrl+C to stop.
 * Data lives in data/pg (gitignored). Matches DATABASE_URL in .env.example.
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const DATA_DIR = "data/pg";
const PORT = Number(process.env.PGPORT_LOCAL ?? 5433);

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "funder",
    password: "funder",
    port: PORT,
    persistent: true,
  });

  const fresh = !existsSync(`${DATA_DIR}/PG_VERSION`);
  if (fresh) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase("funder_finder");
  } catch (err) {
    if (!String(err).includes("already exists")) throw err;
  }
  console.log(`Postgres ready on :${PORT} (db funder_finder). Ctrl+C to stop.`);

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
