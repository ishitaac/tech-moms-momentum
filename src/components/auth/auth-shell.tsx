import Image from "next/image";
import type { ReactNode } from "react";
import { CARD } from "@/components/ui";

/** Centered card used by the sign-in, forgot-password and reset-password pages. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center py-4 sm:py-10">
      <Image src="/tech-moms-logo.png" alt="Tech-Moms" width={120} height={70} priority />
      <p className="mt-2 text-sm font-medium tracking-wide text-muted">FUNDER FINDER</p>
      <div className={`${CARD} mt-6 w-full p-6 sm:p-8`}>
        <h1 className="text-title font-semibold text-plum">{title}</h1>
        {subtitle && <p className="mt-2 text-body text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      <p className="mt-6 max-w-sm text-center text-xs leading-relaxed text-muted">
        Accounts are created by a Tech-Moms admin. Need access? Ask your administrator for an invitation.
      </p>
    </div>
  );
}

export const INPUT =
  "block w-full rounded-[12px] border border-line bg-card px-3 py-2.5 text-body text-plum placeholder:text-muted/70 aria-[invalid=true]:border-rose aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-rose";
export const LABEL = "mb-1.5 block text-sm font-semibold text-plum";

export function FieldError({ id, message }: { id: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-plum">
      <span aria-hidden="true" className="mr-1 font-bold text-rose">!</span>
      {message}
    </p>
  );
}

/** Announced to screen readers; plum text on rose tint (~12:1 contrast). */
export function FormAlert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const style = { error: "border-rose/50 bg-rose-tint", success: "border-teal/50 bg-teal-tint", info: "border-plum/20 bg-plum-tint" }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`mb-5 rounded-[12px] border px-4 py-3 text-sm text-plum ${style}`}>
      {children}
    </div>
  );
}

export function Spinner() {
  return <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}
