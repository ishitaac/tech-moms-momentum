"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authClient, authErrorMessage } from "@/lib/auth/client";
import { AuthCard, FIELD, FormAlert, LABEL, SubmitButton } from "./auth-ui";

/** Same message whether or not the email has an account, so the form can't be used to discover accounts. */
const SENT = "If an account uses that email, a reset link is on its way. It expires in 30 minutes. Check your spam folder too.";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { error: err } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/reset-password" });
      if (err && err.status === 429) setError(authErrorMessage(err, ""));
      else setSent(true);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter the email you sign in with. We'll email you a link to choose a new password."
      footer={
        <Link href="/login" className="font-medium text-plum underline decoration-plum/40 underline-offset-4 hover:decoration-plum">
          Back to sign in
        </Link>
      }
    >
      {error && <FormAlert tone="error">{error}</FormAlert>}
      {sent ? (
        <FormAlert tone="success">{SENT}</FormAlert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" aria-busy={pending}>
          <div>
            <label htmlFor="email" className={LABEL}>
              Email
            </label>
            <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} className={FIELD} />
          </div>
          <SubmitButton pending={pending} pendingLabel="Sending…">
            Send reset link
          </SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
