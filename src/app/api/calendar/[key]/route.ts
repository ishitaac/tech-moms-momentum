import { buildIcs } from "@/lib/ics";
import { upcomingDeadlines, type DeadlineRow } from "@/lib/pipeline-queries";

const ALL = "all";
const VALID_KEY = /^(all|[po]\d{1,10})$/;

const toEvent = (d: DeadlineRow) => ({
  uid: d.key,
  date: d.deadline,
  title: `${d.funderName}: ${d.title} due`,
  description: `Tech-Moms Funder Finder · ${d.kind}`,
  url: d.link.startsWith("http") ? d.link : undefined,
});

/** GET /api/calendar/all → every upcoming deadline; /api/calendar/p12 or /o34 → one. */
export async function GET(_req: Request, ctx: RouteContext<"/api/calendar/[key]">) {
  const { key } = await ctx.params;
  if (!VALID_KEY.test(key)) return new Response("Not found", { status: 404 });

  const rows = await upcomingDeadlines();
  const selected = key === ALL ? rows : rows.filter((r) => r.key === key);
  if (selected.length === 0 && key !== ALL) return new Response("Deadline not found", { status: 404 });

  return new Response(buildIcs(selected.map(toEvent)), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="funder-finder-${key}.ics"`,
    },
  });
}
