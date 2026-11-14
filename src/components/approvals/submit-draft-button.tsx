"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createApprovalFromDraft } from "@/app/approval-actions";
import { BTN } from "@/components/ui";

export function SubmitDraftButton({ draftId, label }: { draftId: number; label: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setError(null);
      try {
        const r = await createApprovalFromDraft({ draftId, submit: true });
        if (!r.ok) return setError(r.error);
        router.push(`/approvals/${r.data.id}`);
      } catch {
        setError("Could not reach the server.");
      }
    });
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button type="button" className={BTN.secondary} onClick={submit} disabled={pending} aria-label={`Submit for approval: ${label}`}>
        {pending ? "Submitting…" : "Submit for approval"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-plum">
          {error}
        </p>
      )}
    </div>
  );
}
