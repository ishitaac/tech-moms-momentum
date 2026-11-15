/**
 * Creates the first admin account (there is no public sign-up).
 *   npm run auth:create-admin -- --email you@tech-moms.org --name "Your Name"
 * The password is read from the ADMIN_PASSWORD env var, or prompted for, so it never lands in shell history.
 * Safe to re-run: refuses if the email already exists. Never deletes or changes existing accounts.
 */
import { createInterface } from "node:readline/promises";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim() || "Admin";
  const role = arg("role") === "staff" ? "staff" : "admin";
  if (!email) throw new Error('Usage: npm run auth:create-admin -- --email you@example.org --name "Your Name" [--role staff]');

  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question("Password (min 12 chars): ");
    rl.close();
  }
  if (!password || password.length < 12) throw new Error("Password must be at least 12 characters.");

  const { auth } = await import("../src/lib/auth/server");
  // Server-side call without a session: allowed by Better Auth's admin plugin for trusted scripts.
  await auth.api.createUser({ body: { email, name, password, role } });
  console.log(`Created ${role} account for ${email}.`);
  process.exit(0);
}

main().catch((err) => {
  const code = err?.body?.code;
  console.error(code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" ? "An account with that email already exists." : err instanceof Error ? err.message : err);
  process.exit(1);
});
