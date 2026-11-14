import { Resend } from "resend";

/**
 * Sends the password-reset link. Uses the same Resend setup as notification emails.
 * Without RESEND_API_KEY: in development the link is printed to the server console so the flow can be
 * tested locally; in production nothing is logged (a reset link is a credential).
 */
export async function sendPasswordResetEmail(to: string, url: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[auth] RESEND_API_KEY not set. Password reset link: ${url}`);
    } else {
      console.warn("[auth] Password reset requested but RESEND_API_KEY is not set; no email was sent.");
    }
    return;
  }
  const from = process.env.EMAIL_FROM ?? "Funder Finder <onboarding@resend.dev>";
  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from,
    to,
    subject: "Reset your Tech-Moms Funder Finder password",
    text: [
      "Someone asked to reset the password for your Tech-Moms Funder Finder account.",
      "",
      `Reset it here (link expires in 30 minutes): ${url}`,
      "",
      "If this wasn't you, ignore this email. Your password stays the same.",
    ].join("\n"),
  });
  if (error) console.error("[auth] reset email failed", error.message);
}
