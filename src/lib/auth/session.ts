import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { auth } from "./server";
import { can, primaryRole, type Permission, type Role } from "./roles";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  rawRole: string | null;
}

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

function toCurrentUser(u: { id: string; name: string; email: string; role?: string | null }): CurrentUser {
  const rawRole = u.role ?? null;
  return { id: u.id, name: u.name, email: u.email, role: primaryRole(rawRole), rawRole };
}

/** Validates the session cookie against the database (expired / revoked / banned sessions return null). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session ? toCurrentUser(session.user) : null;
  } catch (err) {
    unstable_rethrow(err); // let Next's own control-flow signals (prerender bail-out, redirects) through
    console.error("[auth] session lookup failed", err instanceof Error ? err.name : "unknown");
    return null;
  }
}

/**
 * For server components and server actions. No session → redirect to sign-in (server actions follow it too).
 * Signed in without the permission → ForbiddenError (never silently allowed).
 */
export async function requireUser(permission: Permission = "app:use"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?expired=1");
  if (!can(user.rawRole, permission)) throw new ForbiddenError();
  return user;
}

/** For route handlers: returns the user, or a 401/403 JSON response to send back. */
export async function requireApiUser(req: Request, permission: Permission = "app:use"): Promise<CurrentUser | Response> {
  let user: CurrentUser | null = null;
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    user = session ? toCurrentUser(session.user) : null;
  } catch {
    return Response.json({ ok: false, error: "Authentication is unavailable" }, { status: 503 });
  }
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!can(user.rawRole, permission)) return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  return user;
}
