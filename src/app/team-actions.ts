"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { ForbiddenError, requireUser } from "@/lib/auth/session";

type Result = { ok: true; message: string } | { ok: false; error: string };

const createSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120),
  email: z.email("Enter a valid email address.").max(254),
  role: z.enum(["admin", "staff"]),
  password: z.string().min(12, "Temporary password must be at least 12 characters.").max(128),
});

function apiMessage(err: unknown, fallback: string): string {
  const body = (err as { body?: { code?: string } })?.body;
  if (body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") return "Someone already has an account with that email.";
  return fallback;
}

async function guard(fn: () => Promise<Result>): Promise<Result> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: "Only admins can manage team access." };
    if (err && typeof err === "object" && "digest" in err) throw err; // redirect to /login
    throw err;
  }
}

/** Admin creates an account (no public sign-up). They share the temporary password privately; the user can reset it. */
export async function createTeamMember(input: z.input<typeof createSchema>): Promise<Result> {
  return guard(async () => {
    await requireUser("users:manage");
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
    try {
      await auth.api.createUser({ body: { ...parsed.data, email: parsed.data.email.toLowerCase() }, headers: await headers() });
    } catch (err) {
      return { ok: false, error: apiMessage(err, "Couldn't create the account. Try again.") };
    }
    revalidatePath("/team");
    return { ok: true, message: `Account created for ${parsed.data.email}. Share the temporary password privately and ask them to change it with “Forgot password”.` };
  });
}

const roleSchema = z.object({ userId: z.string().min(1).max(64), role: z.enum(["admin", "staff"]) });

export async function setTeamRole(input: z.infer<typeof roleSchema>): Promise<Result> {
  return guard(async () => {
    const me = await requireUser("users:manage");
    const parsed = roleSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid request." };
    if (parsed.data.userId === me.id && parsed.data.role !== "admin") return { ok: false, error: "You can't remove your own admin role. Ask another admin." };
    try {
      await auth.api.setRole({ body: parsed.data, headers: await headers() });
    } catch {
      return { ok: false, error: "Couldn't change the role. Try again." };
    }
    revalidatePath("/team");
    return { ok: true, message: "Role updated." };
  });
}

const accessSchema = z.object({ userId: z.string().min(1).max(64), enabled: z.boolean() });

/** Disable signs the person out everywhere and blocks sign-in; enable restores it. Accounts are never deleted here. */
export async function setTeamAccess(input: z.infer<typeof accessSchema>): Promise<Result> {
  return guard(async () => {
    const me = await requireUser("users:manage");
    const parsed = accessSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid request." };
    if (parsed.data.userId === me.id) return { ok: false, error: "You can't disable your own account." };
    try {
      const h = await headers();
      if (parsed.data.enabled) await auth.api.unbanUser({ body: { userId: parsed.data.userId }, headers: h });
      else await auth.api.banUser({ body: { userId: parsed.data.userId, banReason: "Access removed by an admin" }, headers: h });
    } catch {
      return { ok: false, error: "Couldn't update access. Try again." };
    }
    revalidatePath("/team");
    return { ok: true, message: parsed.data.enabled ? "Access restored." : "Access removed and sessions signed out." };
  });
}
