import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/session";
import { safeReturnTo } from "@/lib/auth/return-to";

export const metadata: Metadata = { title: "Sign in · Tech-Moms Funder Finder" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Login({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = safeReturnTo(first(params.next));
  if (await getCurrentUser()) redirect(next);
  const reason = first(params.reason);
  return <LoginForm next={next} notice={reason === "expired" ? "expired" : reason === "signed-out" ? "signed-out" : reason === "reset" ? "reset" : null} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-10 h-96 w-full max-w-md animate-pulse rounded-[16px] bg-card" />}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}
