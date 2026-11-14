import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Reset password · Tech-Moms Funder Finder" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
