"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { BTN } from "@/components/ui";
import { FieldError, FormAlert, LABEL, Spinner } from "./auth-shell";
import { PasswordInput } from "./password-input";

const MIN = 12;

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const invalid = params.get("error") === "INVALID_TOKEN" || !token;
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

  if (invalid) {
    return (
      <>
        <FormAlert>This reset link is invalid or has expired. Request a new one.</FormAlert>
        <Link href="/forgot-password" className={`${BTN.primary} w-full`}>
          Request a new link
        </Link>
      </>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    const v: typeof errors = {};
    if (password.length < MIN) v.password = `Use at least ${MIN} characters.`;
    else if (password.length > 128) v.password = "Use 128 characters or fewer.";
    if (!v.password && confirm !== password) v.confirm = "The passwords don't match.";
    setErrors(v);
    if (v.password || v.confirm) {
      document.getElementById(v.password ? "password" : "confirm")?.focus();
      return;
    }
    setLoading(true);
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token: token! });
      if (error) {
        setErrors({ form: error.code === "INVALID_TOKEN" ? "This reset link is invalid or has expired. Request a new one." : "We couldn't update your password. Please try again." });
        setLoading(false);
        return;
      }
      router.replace("/login?reset=1");
    } catch {
      setErrors({ form: "We couldn't reach the server. Check your connection and try again." });
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {errors.form && <FormAlert>{errors.form}</FormAlert>}
      <div className="space-y-5">
        <div>
          <label htmlFor="password" className={LABEL}>
            New password
          </label>
          <PasswordInput id="password" name="password" autoComplete="new-password" required aria-invalid={!!errors.password} aria-describedby={`password-hint${errors.password ? " password-error" : ""}`} />
          <p id="password-hint" className="mt-1.5 text-sm text-muted">
            At least {MIN} characters. A short phrase is easier to remember.
          </p>
          <FieldError id="password-error" message={errors.password} />
        </div>
        <div>
          <label htmlFor="confirm" className={LABEL}>
            Confirm new password
          </label>
          <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required aria-invalid={!!errors.confirm} aria-describedby={errors.confirm ? "confirm-error" : undefined} />
          <FieldError id="confirm-error" message={errors.confirm} />
        </div>
      </div>
      <button type="submit" disabled={loading} aria-busy={loading} className={`${BTN.primary} mt-7 w-full py-3 text-base`}>
        {loading && <Spinner />}
        {loading ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
