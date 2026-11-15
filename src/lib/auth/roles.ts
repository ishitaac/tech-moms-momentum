/**
 * Role policy for Funder Finder. Pure functions so they can be unit-tested and reused
 * by server actions, route handlers and pages. The UI may hide controls, but these checks
 * are what actually decide (always on the server).
 */

export const ROLES = ["admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", staff: "Staff" };

export type Permission =
  | "app:use" // grant discovery, pipeline, reports, notifications, settings
  | "draft:generate"
  | "draft:edit"
  | "review:submit"
  | "review:view"
  | "review:decide" // approve / request changes / reject
  | "review:edit-as-reviewer"
  | "users:manage";

const GRANTS: Record<Role, readonly Permission[]> = {
  admin: ["app:use", "draft:generate", "draft:edit", "review:submit", "review:view", "review:decide", "review:edit-as-reviewer", "users:manage"],
  staff: ["app:use", "draft:generate", "draft:edit", "review:submit", "review:view"],
};

/** Unknown or missing roles get no permissions (fail closed). Better Auth may store "a,b" for multiple roles. */
export function rolesOf(raw: string | null | undefined): Role[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((r) => r.trim())
    .filter((r): r is Role => (ROLES as readonly string[]).includes(r));
}

export function can(rawRole: string | null | undefined, permission: Permission): boolean {
  return rolesOf(rawRole).some((r) => GRANTS[r].includes(permission));
}

export function primaryRole(rawRole: string | null | undefined): Role | null {
  const roles = rolesOf(rawRole);
  return roles.includes("admin") ? "admin" : (roles[0] ?? null);
}

/** Only same-origin relative paths are allowed as post-login redirects (blocks open redirects like //evil.com). */
export function safeRedirectPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(next)) return fallback;
  if (next.startsWith("/login") || next.startsWith("/api/")) return fallback;
  return next;
}

/** Paths reachable without a session. Everything else requires sign-in. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/api/auth/") ||
    // Background jobs authenticate with CRON_SECRET inside the route, not a user session.
    pathname.startsWith("/api/cron/")
  );
}
