"use client";

import Image from "next/image";
import { useId, useState, type ReactNode } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { CARD } from "@/components/ui";

export const FIELD =
  "w-full rounded-[12px] border border-control bg-card px-3 py-2.5 text-[15px] text-plum placeholder:text-muted focus:border-plum focus:outline-none focus:ring-2 focus:ring-plum/30 disabled:opacity-60";
export const LABEL = "mb-1.5 block text-sm font-semibold text-plum";

/** Centered Tech-Moms branded card for the signed-out pages. */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center py-4 sm:py-10">
      <Image src="/tech-moms-logo.png" alt="Tech-Moms" width={120} height={70} priority className="mb-6" />
      <div className={`${CARD} w-full p-6 sm:p-8`}>
        <h1 className="text-2xl font-semibold text-plum">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}

export function FormAlert({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-rose bg-rose-tint",
    success: "border-teal-strong bg-teal-tint",
    info: "border-plum/30 bg-plum-tint",
  }[tone];
  const label = { error: "Error:", success: "Success:", info: "Note:" }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`mb-4 rounded-[12px] border px-3 py-2.5 text-sm text-plum ${styles}`}>
      <span className="font-semibold">{label}</span> {children}
    </div>
  );
}

export function Spinner() {
  return <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

export function SubmitButton({ pending, children, pendingLabel }: { pending: boolean; children: ReactNode; pendingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-plum px-4 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-plum/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending && <Spinner />}
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Password input with a show/hide toggle (a real button, announced to screen readers). */
export function PasswordField({
  label,
  name,
  autoComplete,
  value,
  onChange,
  disabled,
  describedBy,
  minLength,
}: {
  label: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  describedBy?: string;
  minLength?: number;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          maxLength={128}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-describedby={describedBy}
          className={`${FIELD} pr-24`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute inset-y-1 right-1 inline-flex min-w-[44px] items-center gap-1.5 rounded-full px-3 text-sm font-medium text-plum hover:bg-plum-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum"
        >
          {visible ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          {visible ? "Hide" : "Show"}
          <span className="sr-only"> password</span>
        </button>
      </div>
    </div>
  );
}
