import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!);
const [r] = await sql`select id from funders where name='Sorenson Legacy Foundation'`; console.log(r.id); await sql.end();
