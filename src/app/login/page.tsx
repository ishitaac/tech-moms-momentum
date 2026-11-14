import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { safeRedirectPath } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in · Funder Finder · Tech-Moms" };

/** Already signed in? Skip the form and go where they were headed. */
async function AlreadySignedIn({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const user = await getCurrentUser();
  if (user) {
    const next = (await searchParams).next;
    redirect(safeRedirectPath(typeof next === "string" ? next : null));
  }
  return null;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to find funders, track your pipeline and review AI drafts.">
      <Suspense fallback={null}>
        <AlreadySignedIn searchParams={props.searchParams} />
      </Suspense>
      <Suspense fallback={<div className="h-72 animate-pulse rounded-[12px] bg-plum-tint" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
