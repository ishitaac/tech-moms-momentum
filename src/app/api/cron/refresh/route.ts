import { runRefresh } from "@/lib/pipeline/refresh";

/**
 * Vercel Cron hits this daily (vercel.json); it only does work when 14+ days have passed.
 * Protected by CRON_SECRET (Vercel sends it as a Bearer token).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runRefresh();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("cron refresh failed", err);
    return Response.json({ ok: false, error: "Refresh failed" }, { status: 500 });
  }
}
