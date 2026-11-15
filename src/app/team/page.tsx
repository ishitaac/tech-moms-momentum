import { headers } from "next/headers";
import { Suspense } from "react";
import { InviteForm, MemberControls } from "@/components/team/team-forms";
import { CARD, PageHeader, Pill } from "@/components/ui";
import { auth } from "@/lib/auth/server";
import { can, primaryRole, ROLE_LABEL } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";

async function Team() {
  const me = await requireUser("app:use");
  if (!can(me.rawRole, "users:manage")) {
    return (
      <div role="alert" className={`${CARD} px-6 py-12 text-center`}>
        <h2 className="text-section font-semibold text-plum">Admins only</h2>
        <p className="mt-2 text-body text-muted">Ask a Tech-Moms admin if you need to add or change team members.</p>
      </div>
    );
  }
  const { users } = await auth.api.listUsers({ query: { limit: 200, sortBy: "createdAt", sortDirection: "asc" }, headers: await headers() });

  return (
    <div className="space-y-6">
      <InviteForm />
      <section className={`${CARD} p-5`} aria-labelledby="members-heading">
        <h2 id="members-heading" className="mb-4 text-section font-semibold">Team members ({users.length})</h2>
        <ul className="divide-y divide-line">
          {users.map((u) => {
            const role = primaryRole((u as { role?: string | null }).role) ?? "staff";
            const banned = !!(u as { banned?: boolean | null }).banned;
            return (
              <li key={u.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-plum">
                    {u.name} {banned && <Pill tone="rose">Access removed</Pill>}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {u.email} · {ROLE_LABEL[role]}
                  </p>
                </div>
                <MemberControls userId={u.id} name={u.name} role={role} banned={banned} isSelf={u.id === me.id} />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

export default function TeamPage() {
  return (
    <>
      <PageHeader title="Team access" subtitle="Who can sign in, and who can approve AI-generated content." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[16px] bg-card" />}>
        <Team />
      </Suspense>
    </>
  );
}
