"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { safeRedirectPath } from "@/lib/auth/roles";
import { BTN } from "@/components/ui";
import { FieldError, FormAlert, INPUT, LABEL, Spinner } from "./auth-shell";
import { PasswordInput } from "./password-input";

type Errors = { email?: string; password?: string; form?: string };

function messageFor(status: number | undefined, code: string | undefined): string {
  if (status === 429) return "Too many sign-in attempts. Wait a minute and try again.";
  if (code === "BANNED_USER" || status === 403) return "This account has been disabled. Contact your administrator.";
  if (status === 401 || code === "INVALID_EMAIL_OR_PASSWORD") return "That email and password don't match. Check them and try again.";
  if (status && status >= 500) return "Sign-in is temporarily unavailable. Please try again shortly.";
  return "We couldn't sign you in. Please try again.";
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeRedirectPath(params.get("next"));
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  const notice =
    params.get("expired") === "1"
      ? "Your session ended. Please sign in again."
      : params.get("reset") === "1"
        ? "Your password was updated. Sign in with your new password."
        : params.get("signedOut") === "1"
          ? "You've signed out."
          : null;
  const unavailable = params.get("error") === "unavailable";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const v: Errors = {};
    if (!email) v.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) v.email = "Enter a valid email address, like name@tech-moms.org.";
    if (!password) v.password = "Enter your password.";
    setErrors(v);
    if (v.email || v.password) {
      document.getElementById(v.email ? "email" : "password")?.focus();
      return;
    }

    setLoading(true);
    try {
      const { error } = await authClient.signIn.email({ email, password });
      if (error) {
        setErrors({ form: messageFor(error.status, error.code) });
        setLoading(false);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setErrors({ form: "We couldn't reach the server. Check your connection and try again." });
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-describedby={errors.form ? "form-error" : undefined}>
      {notice && !errors.form && <FormAlert tone="info">{notice}</FormAlert>}
      {unavailable && !errors.form && <FormAlert>Sign-in is temporarily unavailable. Please try again shortly.</FormAlert>}
      {errors.form && (
        <div id="form-error">
          <FormAlert>{errors.form}</FormAlert>
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label htmlFor="email" className={LABEL}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            className={INPUT}
          />
          <FieldError id="email-error" message={errors.email} />
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="text-sm font-semibold text-plum">
              Password
            </label>
            <Link href="/forgot-password" className={BTN.link}>
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
          />
          <FieldError id="password-error" message={errors.password} />
        </div>
      </div>

      <button type="submit" disabled={loading} aria-busy={loading} className={`${BTN.primary} mt-7 w-full py-3 text-base`}>
        {loading && <Spinner />}
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
