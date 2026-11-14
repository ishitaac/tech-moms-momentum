import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";
import { db, schema } from "@/db";
import { sendPasswordResetEmail } from "./email";

const SESSION_DAYS = 7;

// Admins: full user management. Staff: no user-management rights (app permissions live in roles.ts).
const ac = createAccessControl(defaultStatements);
const adminRole = ac.newRole(adminAc.statements);
const staffRole = ac.newRole({ user: [], session: [] });

/**
 * Missing BETTER_AUTH_SECRET in production is a hard error (Better Auth refuses to start with its default).
 * We never invent a secret; see README "Authentication" for setup.
 */
export const auth = betterAuth({
  appName: "Tech-Moms Funder Finder",
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.authUsers,
      session: schema.authSessions,
      account: schema.authAccounts,
      verification: schema.authVerifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Accounts are created by an admin (Settings → Team access) or scripts/create-admin.ts. No public sign-up.
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url);
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * SESSION_DAYS,
    updateAge: 60 * 60 * 24, // slide the expiry at most once a day
  },
  rateLimit: { enabled: true, window: 60, max: 30, customRules: { "/sign-in/email": { window: 60, max: 5 }, "/request-password-reset": { window: 300, max: 3 } } },
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
  plugins: [
    admin({
      ac,
      roles: { admin: adminRole, staff: staffRole },
      defaultRole: "staff",
      adminRoles: ["admin"],
    }),
    nextCookies(), // must be last: lets server actions set auth cookies
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
