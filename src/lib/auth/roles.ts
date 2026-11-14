/**
 * Roles and what each may do. Pure (no DB, no framework) so it is unit tested and shared by
 * server checks and UI hints. The server is always the authority; the UI only hides buttons.
 */

export const ROLES = ["admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = { admin: "Admin", staff: "Staff" };

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Unknown or missing roles get the least privilege. */
export function normalizeRole(value: unknown): Role {
  return isRole(value) ? value : "staff";
}

/** Approve / request changes / reject AI-generated content. */
export function canReview(role: Role): boolean {
  return role === "admin";
}

/** Create, edit and submit AI-generated content for approval. */
export function canAuthor(role: Role): boolean {
  return role === "admin" || role === "staff";
}
