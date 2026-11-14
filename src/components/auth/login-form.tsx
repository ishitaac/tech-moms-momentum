"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authClient, authErrorMessage } from "@/lib/auth/client";
import { AuthCard, FIELD, FormAlert, LABEL, PasswordField, SubmitButton } from "./auth-ui";

const NOTICES = {
  expired: { tone: "info" as const, text: "Your session expired. Sign in again to pick up where you left off." },
  "signed-out": { tone: "success" as const, text: "You signed out." },
  reset: { tone: "success" as const, text: "Your password was reset. Sign in with your new password." },
};

export function LoginForm({ next, notice }: { next: string; notice: keyof typeof NOTICES | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { error: err } = await authClient.signIn.email({ email: email.trim(), password });
      if (err) {
        setError(authErrorMessage(err, "Could not sign in. Try again."));
        setPending(false);
        return;
      }
      // Full navigation so the server renders the signed-in layout for the intended page.
      window.location.assign(next);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setPending(false);
    }
  }

  const n = notice ? NOTICES[notice] : null;
  return (
    <AuthCard
      title="Sign in to Funder Finder"
      subtitle="For Tech-Moms staff. Accounts are created by an administrator."
      footer={
        <>
          Need access? Ask a Tech-Moms admin to create your account.
          <br />
          <a href="https://www.tech-moms.org/" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-medium text-plum underline decoration-plum/40 underline-offset-4 hover:decoration-plum">
            Visit Tech-Moms Website<span className="sr-only"> (opens in a new tab)</span> ↗
          </a>
        </>
      }
    >
      {n && !error && <FormAlert tone={n.tone}>{n.text}</FormAlert>}
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <form onSubmit={onSubmit} noValidate={false} className="space-y-4" aria-busy={pending}>
        <div>
          <label htmlFor="email" className={LABEL}>
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} className={FIELD} />
        </div>
        <PasswordField label="Password" name="password" autoComplete="current-password" value={password} onChange={setPassword} disabled={pending} />
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium text-plum underline decoration-plum/40 underline-offset-4 hover:decoration-plum">
            Forgot password?
          </Link>
        </div>
        <SubmitButton pending={pending} pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
