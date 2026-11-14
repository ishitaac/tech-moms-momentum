"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient, authErrorMessage } from "@/lib/auth/client";
import { AuthCard, FormAlert, PasswordField, SubmitButton } from "./auth-ui";

const MIN = 12;
const linkClass = "font-medium text-plum underline decoration-plum/40 underline-offset-4 hover:decoration-plum";

export function ResetPasswordForm({ token, linkError }: { token: string | null; linkError: string | null }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  if (!token || linkError) {
    return (
      <AuthCard title="This link can't be used" footer={<Link href="/login" className={linkClass}>Back to sign in</Link>}>
        <FormAlert tone="error">This reset link is invalid or has expired. Links work once and expire after 30 minutes.</FormAlert>
        <Link href="/forgot-password" className="inline-flex w-full items-center justify-center rounded-full bg-plum px-4 py-3 text-[15px] font-semibold text-white hover:bg-plum/90">
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN) return setError(`Use at least ${MIN} characters.`);
    if (password !== confirm) return setError("The two passwords don't match.");
    setPending(true);
    try {
      const { error: err } = await authClient.resetPassword({ newPassword: password, token: token! });
      if (err) {
        setError(authErrorMessage(err, "Could not reset your password. Request a new link and try again."));
        setPending(false);
        return;
      }
      router.push("/login?reason=reset");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <AuthCard title="Choose a new password" subtitle="You'll be signed out everywhere else once it's changed." footer={<Link href="/login" className={linkClass}>Back to sign in</Link>}>
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <form onSubmit={onSubmit} className="space-y-4" aria-busy={pending}>
        <PasswordField label="New password" name="password" autoComplete="new-password" value={password} onChange={setPassword} disabled={pending} minLength={MIN} describedBy="pw-hint" />
        <p id="pw-hint" className="-mt-2 text-xs text-muted">
          At least {MIN} characters. A short phrase is easier to remember than random symbols.
        </p>
        <PasswordField label="Confirm new password" name="confirm" autoComplete="new-password" value={confirm} onChange={setConfirm} disabled={pending} minLength={MIN} />
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save new password
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
