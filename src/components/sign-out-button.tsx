"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { SignOutIcon } from "./icons";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function signOut() {
    setPending(true);
    setError(false);
    try {
      const { error: err } = await authClient.signOut();
      if (err) throw err;
      // Full reload on purpose: drops every cached page from the client router so no
      // fundraising data stays in memory after sign-out.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login?reason=signed-out");
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        className="mt-2 inline-flex items-center gap-2 rounded-full px-0 py-1 text-sm font-medium text-plum underline decoration-plum/40 underline-offset-4 hover:decoration-plum disabled:opacity-60"
      >
        <SignOutIcon className="h-4 w-4" />
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-plum">
          Could not sign out. Try again.
        </p>
      )}
    </>
  );
}
