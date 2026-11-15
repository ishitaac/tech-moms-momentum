import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { auth } from "@/lib/auth/server";
import { isPublicPath } from "@/lib/auth/roles";

/**
 * Sign-in gate for every page and API route except the public auth pages, /api/auth/* and
 * /api/cron/* (which checks CRON_SECRET itself). The session is validated against the database here,
 * and again inside server actions / route handlers / approval pages (defense in depth).
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  let unavailable = false;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch {
    unavailable = true;
  }
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: unavailable ? "Authentication is unavailable" : "Unauthorized" },
      { status: unavailable ? 503 : 401 },
    );
  }

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  // A cookie that no longer maps to a valid session means it expired or was revoked.
  if (getSessionCookie(request)) login.searchParams.set("expired", "1");
  if (unavailable) login.searchParams.set("error", "unavailable");
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"],
};
