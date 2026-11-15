import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password · Funder Finder · Tech-Moms" };

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password" subtitle="You'll be signed out on other devices once it's updated.">
      <Suspense fallback={<div className="h-56 animate-pulse rounded-[12px] bg-plum-tint" />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
