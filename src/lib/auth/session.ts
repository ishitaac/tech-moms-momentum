/**
 * Data Access Layer for auth (Next.js docs: "Creating a Data Access Layer").
 * Every check here validates the session against the database via Better Auth.
 * The proxy (src/proxy.ts) only does a fast cookie-presence redirect; it is not the security boundary.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { canReview, normalizeRole, type Role } from "./roles";
import { loginHref } from "./return-to";
import { auth } from "./auth";
import { RETURN_TO_HEADER } from "./session-header";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
  }
}

export const SIGNED_OUT_MESSAGE = "Your session has expired. Sign in again to continue.";
export const FORBIDDEN_MESSAGE = "You don't have permission to do that.";

/** Memoized per request. Returns null when signed out or the session expired/was revoked. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) return null;
  const u = session.user as typeof session.user & { role?: unknown };
  return { id: u.id, name: u.name, email: u.email, role: normalizeRole(u.role) };
});

/** Pages: redirect to /login (back to this page afterwards) when there is no valid session. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user) return user;
  const h = await headers();
  const hadCookie = (h.get("cookie") ?? "").includes("session_token");
  redirect(loginHref(h.get(RETURN_TO_HEADER), hadCookie ? "expired" : undefined));
}

/** Server actions and API routes: throw instead of redirecting. */
export async function requireActionUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(SIGNED_OUT_MESSAGE, 401);
  return user;
}

export async function requireReviewer(): Promise<CurrentUser> {
  const user = await requireActionUser();
  if (!canReview(user.role)) throw new AuthError(FORBIDDEN_MESSAGE, 403);
  return user;
}

/** For API route handlers: a JSON 401/403 instead of a redirect. */
export async function apiUserOrResponse(): Promise<CurrentUser | Response> {
  try {
    return await requireActionUser();
  } catch (err) {
    if (err instanceof AuthError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
}
