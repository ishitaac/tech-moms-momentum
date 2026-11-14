"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { BTN } from "@/components/ui";
import { FieldError, FormAlert, INPUT, LABEL, Spinner } from "./auth-shell";

/** Always shows the same confirmation whether or not the account exists (no account enumeration). */
export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter the email address you sign in with.");
      document.getElementById("email")?.focus();
      return;
    }
    setError(null);
    setFormError(null);
    setLoading(true);
    try {
      const { error: apiError } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
      if (apiError?.status === 429) setFormError("Too many requests. Wait a few minutes and try again.");
      else if (apiError && apiError.status >= 500) setFormError("We couldn't send the email right now. Please try again later.");
      else setSent(true);
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <>
        <FormAlert tone="success">If an account exists for that email, we&apos;ve sent a link to reset the password. The link expires in 1 hour.</FormAlert>
        <Link href="/login" className={`${BTN.secondary} w-full`}>
          Back to sign in
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {formError && <FormAlert>{formError}</FormAlert>}
      <label htmlFor="email" className={LABEL}>
        Email
      </label>
      <input id="email" name="email" type="email" autoComplete="username" required aria-invalid={!!error} aria-describedby={error ? "email-error" : undefined} className={INPUT} />
      <FieldError id="email-error" message={error} />
      <button type="submit" disabled={loading} aria-busy={loading} className={`${BTN.primary} mt-6 w-full py-3 text-base`}>
        {loading && <Spinner />}
        {loading ? "Sending…" : "Send reset link"}
      </button>
      <p className="mt-5 text-center">
        <Link href="/login" className={BTN.link}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
