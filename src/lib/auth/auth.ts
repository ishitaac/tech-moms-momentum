/**
 * Authentication: Better Auth (established open-source library) on our own Postgres via Drizzle.
 * Better Auth owns password hashing (scrypt), session tokens, cookies, reset tokens and rate limits;
 * this app never hashes or compares passwords itself.
 *
 * - No public sign-up. Accounts are created by an admin with `npm run auth:create-user`.
 * - Roles (admin | staff) live on the user row and can't be set from a client request.
 * - Sessions: httpOnly, SameSite=Lax cookies (Secure on https), 12-hour lifetime, renewed hourly while active.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/db";
import { sendPasswordResetEmail } from "./email";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const SESSION_RENEW_SECONDS = 60 * 60;
const RESET_TOKEN_SECONDS = 60 * 30;
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

const secret = process.env.BETTER_AUTH_SECRET;
if (process.env.NODE_ENV === "production" && !secret && process.env.NEXT_PHASE !== "phase-production-build") {
  throw new Error("BETTER_AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` (see .env.example).");
}

export const auth = betterAuth({
  appName: "Tech-Moms Funder Finder",
  secret,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.authUsers,
      session: schema.authSessions,
      account: schema.authAccounts,
      verification: schema.authVerifications,
      rateLimit: schema.authRateLimits,
    },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
    resetPasswordTokenExpiresIn: RESET_TOKEN_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url);
    },
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "staff", input: false },
    },
  },
  session: {
    expiresIn: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_RENEW_SECONDS,
  },
  rateLimit: {
    enabled: process.env.AUTH_RATE_LIMIT !== "off",
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
      "/reset-password": { window: 300, max: 5 },
    },
  },
  telemetry: { enabled: false },
  // Must be last: lets server actions set auth cookies.
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
