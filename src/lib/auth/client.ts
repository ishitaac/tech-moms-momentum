"use client";

import { createAuthClient } from "better-auth/react";

/** Browser client for Better Auth's /api/auth endpoints (same origin). */
export const authClient = createAuthClient();

/** Plain-language message for a failed auth call. Never reveals whether an email has an account. */
export function authErrorMessage(err: { status?: number; code?: string } | null | undefined, fallback: string): string {
  if (!err) return fallback;
  if (err.status === 429) return "Too many attempts. Wait a minute, then try again.";
  if (err.code === "INVALID_EMAIL_OR_PASSWORD" || err.status === 401) return "That email and password don't match. Check them and try again.";
  if (err.code === "INVALID_TOKEN") return "This reset link is invalid or has expired. Request a new one.";
  if (err.code === "PASSWORD_TOO_SHORT") return "Use at least 12 characters.";
  if (err.code === "PASSWORD_TOO_LONG") return "Use 128 characters or fewer.";
  return fallback;
}
