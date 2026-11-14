import { Resend } from "resend";

/**
 * Password reset delivery. Uses the existing Resend setup (RESEND_API_KEY, EMAIL_FROM).
 * Without a key, production refuses quietly (the UI never reveals whether an account exists);
 * local development prints the link to the server console so the flow can be tested.
 */
export async function sendPasswordResetEmail(to: string, url: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[auth] RESEND_API_KEY not set — password reset link for local testing: ${url}`);
    } else {
      console.error("[auth] Password reset requested but RESEND_API_KEY is not configured.");
    }
    return;
  }
  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Funder Finder <onboarding@resend.dev>",
    to,
    subject: "Reset your Funder Finder password",
    text: `Someone asked to reset the password for your Tech-Moms Funder Finder account.\n\nReset it here (link expires in 1 hour):\n${url}\n\nIf this wasn't you, you can ignore this email.`,
  });
  if (error) console.error("[auth] password reset email failed", error.name);
}
