"use client";

import { BTN, CARD } from "@/components/ui";

export default function ApprovalsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className={`${CARD} px-6 py-12 text-center`}>
      <h2 className="text-section font-semibold text-plum">We couldn’t load approvals.</h2>
      <p className="mt-2 text-body text-muted">Your drafts are safe. Try again in a moment.</p>
      <button type="button" onClick={() => retry()} className={`${BTN.primary} mt-6`}>
        Try again
      </button>
    </div>
  );
}
