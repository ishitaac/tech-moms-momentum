import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password · Tech-Moms Funder Finder" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Reset({ searchParams }: Pick<PageProps<"/reset-password">, "searchParams">) {
  const params = await searchParams;
  return <ResetPasswordForm token={first(params.token) ?? null} linkError={first(params.error) ?? null} />;
}

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-10 h-96 w-full max-w-md animate-pulse rounded-[16px] bg-card" />}>
      <Reset searchParams={searchParams} />
    </Suspense>
  );
}
