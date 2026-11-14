/**
 * Create a staff account (public sign-up is disabled), or change an existing account's role.
 *
 *   npm run auth:create-user -- --email robbyn@tech-moms.org --name "Robbyn" --role admin
 *   npm run auth:create-user -- --email someone@tech-moms.org --set-role staff
 *
 * Password: taken from AUTH_NEW_USER_PASSWORD if set, otherwise a strong random one is generated and
 * printed ONCE. Ask the person to change it with "Forgot password?" after first sign-in.
 * The hash is produced by Better Auth itself; this script never hashes passwords on its own.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { auth, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../src/lib/auth/auth";
import { isRole, type Role } from "../src/lib/auth/roles";

function usage(msg: string): never {
  console.error(`${msg}\n\nUsage:\n  npm run auth:create-user -- --email <email> --name "<name>" --role <admin|staff>\n  npm run auth:create-user -- --email <email> --set-role <admin|staff>`);
  process.exit(1);
}

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" }, role: { type: "string", default: "staff" }, "set-role": { type: "string" } },
  });
  const email = values.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) usage("A valid --email is required.");

  const [existing] = await db.select().from(schema.authUsers).where(eq(schema.authUsers.email, email));

  if (values["set-role"]) {
    const role = values["set-role"];
    if (!isRole(role)) usage("--set-role must be admin or staff.");
    if (!existing) usage(`No account for ${email}.`);
    await db.update(schema.authUsers).set({ role, updatedAt: new Date() }).where(eq(schema.authUsers.id, existing.id));
    console.log(`Role for ${email} is now ${role}.`);
    return;
  }

  if (existing) usage(`An account for ${email} already exists. Use --set-role to change its role, or "Forgot password?" to reset it.`);
  const name = values.name?.trim();
  if (!name) usage('--name is required, e.g. --name "Robbyn".');
  const role = values.role as string;
  if (!isRole(role)) usage("--role must be admin or staff.");

  const supplied = process.env.AUTH_NEW_USER_PASSWORD;
  const password = supplied ?? randomBytes(18).toString("base64url");
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    usage(`AUTH_NEW_USER_PASSWORD must be ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters.`);
  }

  const ctx = await auth.$context;
  const hash = await ctx.password.hash(password);
  const user = await ctx.internalAdapter.createUser({ email, name, emailVerified: true, role: role as Role }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: hash });

  console.log(`Created ${role} account for ${email}.`);
  if (!supplied) {
    console.log(`Temporary password (shown once, share it privately): ${password}`);
    console.log('Ask them to sign in and change it with "Forgot password?".');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
