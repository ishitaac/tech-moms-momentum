import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Reset password · Funder Finder · Tech-Moms" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="Enter the email you sign in with and we'll send you a reset link.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
