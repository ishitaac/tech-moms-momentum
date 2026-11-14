"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createTeamMember, setTeamAccess, setTeamRole } from "@/app/team-actions";
import { BTN, CARD } from "@/components/ui";

const INPUT = "block w-full rounded-[12px] border border-line bg-card px-3 py-2 text-sm text-plum";
const LABEL = "mb-1 block text-sm font-semibold text-plum";

function Feedback({ result }: { result: { ok: boolean; text: string } | null }) {
  if (!result) return null;
  return (
    <p role={result.ok ? "status" : "alert"} className={`mt-3 rounded-[12px] border px-3 py-2 text-sm text-plum ${result.ok ? "border-teal/50 bg-teal-tint" : "border-rose/50 bg-rose-tint"}`}>
      {result.text}
    </p>
  );
}

export function InviteForm() {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    start(async () => {
      const r = await createTeamMember({
        name: String(f.get("name") ?? ""),
        email: String(f.get("email") ?? ""),
        role: f.get("role") === "admin" ? "admin" : "staff",
        password: String(f.get("password") ?? ""),
      });
      setResult(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) form.reset();
    });
  }

  return (
    <section className={`${CARD} p-5`} aria-labelledby="invite-heading">
      <h2 id="invite-heading" className="text-section font-semibold">Add a team member</h2>
      <p className="mt-1 text-sm text-muted">There is no public sign-up. Create the account here and share the temporary password privately.</p>
      <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tm-name" className={LABEL}>Name</label>
          <input id="tm-name" name="name" required maxLength={120} autoComplete="off" className={INPUT} />
        </div>
        <div>
          <label htmlFor="tm-email" className={LABEL}>Email</label>
          <input id="tm-email" name="email" type="email" required autoComplete="off" className={INPUT} />
        </div>
        <div>
          <label htmlFor="tm-role" className={LABEL}>Role</label>
          <select id="tm-role" name="role" defaultValue="staff" className={INPUT}>
            <option value="staff">Staff — draft, edit and submit</option>
            <option value="admin">Admin — also approves and manages team</option>
          </select>
        </div>
        <div>
          <label htmlFor="tm-password" className={LABEL}>Temporary password</label>
          <input id="tm-password" name="password" type="text" required minLength={12} maxLength={128} autoComplete="new-password" aria-describedby="tm-password-hint" className={INPUT} />
          <p id="tm-password-hint" className="mt-1 text-xs text-muted">At least 12 characters.</p>
        </div>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pending} className={BTN.primary}>{pending ? "Creating…" : "Create account"}</button>
        </div>
      </form>
      <Feedback result={result} />
    </section>
  );
}

export function MemberControls({ userId, name, role, banned, isSelf }: { userId: string; name: string; role: "admin" | "staff"; banned: boolean; isSelf: boolean }) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (isSelf) return <span className="text-xs text-muted">This is you</span>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`role-${userId}`} className="sr-only">Role for {name}</label>
        <select
          id={`role-${userId}`}
          defaultValue={role}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value === "admin" ? "admin" : "staff";
            start(async () => {
              const r = await setTeamRole({ userId, role: next });
              setResult(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
            });
          }}
          className="rounded-full border border-line bg-card px-3 py-1.5 text-sm text-plum"
        >
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!banned && !window.confirm(`Remove ${name}'s access? They'll be signed out everywhere.`)) return;
            start(async () => {
              const r = await setTeamAccess({ userId, enabled: banned });
              setResult(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
            });
          }}
          className={BTN.secondary}
        >
          {banned ? "Restore access" : "Remove access"}
        </button>
      </div>
      <Feedback result={result} />
    </div>
  );
}
