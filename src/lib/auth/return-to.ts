/**
 * Where to send someone after they sign in. Only same-site paths are allowed, so a crafted
 * link like /login?next=https://evil.example cannot bounce a signed-in user off-site.
 */

export const DEFAULT_RETURN_TO = "/";
const MAX_LENGTH = 512;
const AUTH_PAGES = ["/login", "/forgot-password", "/reset-password"];

export function safeReturnTo(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LENGTH) return DEFAULT_RETURN_TO;
  // Must be a path on this site: starts with one "/", no protocol-relative "//" or "/\".
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_RETURN_TO;
  if (/[\u0000-\u001f\\]/.test(raw)) return DEFAULT_RETURN_TO;
  try {
    const url = new URL(raw, "http://internal.invalid");
    if (url.origin !== "http://internal.invalid") return DEFAULT_RETURN_TO;
    if (AUTH_PAGES.includes(url.pathname) || url.pathname.startsWith("/api/")) return DEFAULT_RETURN_TO;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_RETURN_TO;
  }
}

/** /login?next=<path>[&reason=expired] */
export function loginHref(returnTo: string | null | undefined, reason?: "expired"): string {
  const params = new URLSearchParams();
  const next = safeReturnTo(returnTo);
  if (next !== DEFAULT_RETURN_TO) params.set("next", next);
  if (reason) params.set("reason", reason);
  const q = params.toString();
  return q ? `/login?${q}` : "/login";
}
