import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { loginHref } from "@/lib/auth/return-to";
import { RETURN_TO_HEADER } from "@/lib/auth/session-header";

/**
 * Optimistic gate (cookie present?) so signed-out visitors go straight to /login.
 * NOT the security boundary: pages, server actions and API routes each validate the session
 * against the database (src/lib/auth/session.ts).
 */

const PUBLIC_PAGES = new Set(["/login", "/forgot-password", "/reset-password"]);
/** Better Auth's own endpoints, and the cron route (it has its own CRON_SECRET bearer check). */
const PUBLIC_API_PREFIXES = ["/api/auth/", "/api/cron/"];

export default function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PAGES.has(pathname) || PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!getSessionCookie(req)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
    }
    // Server actions are POSTs to the page path; let them through to their own server-side check,
    // which returns a clean "session expired" error instead of an HTML redirect.
    if (req.method === "GET" || req.method === "HEAD") {
      return NextResponse.redirect(new URL(loginHref(`${pathname}${search}`), req.url));
    }
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(RETURN_TO_HEADER, `${pathname}${search}`);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Everything except Next internals and static files in /public.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml)$).*)"],
};
