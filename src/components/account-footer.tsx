"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth/client";
import { BTN } from "./ui";
import { ExternalLinkIcon, LogoutIcon } from "./icons";

export interface NavUser {
  name: string;
  email: string;
  roleLabel: string;
  canManageUsers: boolean;
}

export const TECH_MOMS_URL = "https://www.tech-moms.org/";

/** Bottom of the sidebar: official website link, who is signed in, and sign out. */
export function AccountFooter({ user, children }: { user: NavUser; children?: ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setPending(true);
    setError(null);
    try {
      const { error: apiError } = await authClient.signOut();
      if (apiError) throw new Error(apiError.message);
      router.replace("/login?signedOut=1");
      router.refresh();
    } catch {
      setError("Couldn't sign out. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="mt-auto flex flex-col gap-4 pt-8">
      <a href={TECH_MOMS_URL} target="_blank" rel="noopener noreferrer" className={`${BTN.soft} w-full`}>
        Visit Tech-Moms Website
        <ExternalLinkIcon className="h-4 w-4" />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
      <div className="border-t border-line px-2 pt-4">
        <p className="truncate text-sm font-semibold text-plum" title={user.email}>
          {user.name}
        </p>
        <p className="truncate text-xs text-muted">
          {user.roleLabel} · {user.email}
        </p>
        <button type="button" onClick={signOut} disabled={pending} className={`${BTN.secondary} mt-3 w-full`}>
          <LogoutIcon className="h-4 w-4" />
          {pending ? "Signing out…" : "Sign out"}
        </button>
        {error && (
          <p role="alert" className="mt-2 text-xs text-plum">
            {error}
          </p>
        )}
      </div>
      {children}
      <p className="px-2 text-xs leading-relaxed text-muted">Built from public information. You make every decision.</p>
    </div>
  );
}
