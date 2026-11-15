"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { getDraftApproval, submitDraftForApproval, type DraftApproval } from "@/app/approval-actions";
import { BTN } from "@/components/ui";
import { buildMailtoHref } from "@/lib/outreach";
import { ConfirmDialog } from "./confirm-dialog";
import { ReviewStatusPill } from "./status-pill";

/**
 * Shown under a saved AI draft. Lets the author submit it for approval, shows the decision,
 * and only offers "Open in email" once the stored text is approved — with a confirmation, and
 * the person still sends it from their own mail app. Nothing is ever sent automatically.
 */
export function ApprovalControls({ draftId, dirty, offerEmail = false }: { draftId: number; dirty: boolean; offerEmail?: boolean }) {
  const [state, setState] = useState<DraftApproval | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    try {
      const r = await getDraftApproval(draftId);
      if (r.ok) setState(r.data);
      else setMessage(r.error);
    } catch {
      setMessage("Couldn't load the approval status.");
    }
  }, [draftId]);

  useEffect(() => {
    let cancelled = false;
    getDraftApproval(draftId)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setState(r.data);
        else setMessage(r.error);
      })
      .catch(() => !cancelled && setMessage("Couldn't load the approval status."));
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  const submit = () =>
    start(async () => {
      setMessage(null);
      try {
        const r = await submitDraftForApproval(draftId);
        setMessage(r.ok ? "Submitted. An admin will review it in Approvals." : r.error);
        await load();
      } catch {
        setMessage("Couldn't submit. Try again.");
      }
    });

  const status = state?.status ?? null;
  const sendHref = offerEmail && state?.approved ? buildMailtoHref(state.approved.subject, state.approved.body) : null;
  const canSubmit = !dirty && (status === null || status === "draft" || status === "changes_requested");

  return (
    <div className="space-y-2 rounded-[12px] border border-line bg-card p-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-plum">Approval</span>
        {state ? <ReviewStatusPill status={status} /> : <span className="text-xs text-muted">Loading…</span>}
        {state?.reviewId && (
          <Link href={`/approvals/${state.reviewId}`} className="text-xs font-medium text-plum underline underline-offset-2">
            Open review
          </Link>
        )}
      </div>
      {dirty && <p className="text-xs text-plum">You have unsaved edits. Save the draft to submit (or keep) it for approval.</p>}
      {state?.reviewNotes && (status === "changes_requested" || status === "rejected") && (
        <p className="text-xs text-plum">
          <span className="font-semibold">Reviewer notes:</span> {state.reviewNotes}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {canSubmit && (
          <button type="button" onClick={submit} disabled={pending} className={BTN.secondary}>
            {status === "changes_requested" ? "Resubmit for approval" : "Submit for approval"}
          </button>
        )}
        {sendHref && state?.canSend && !dirty && (
          <button type="button" onClick={() => setConfirmSend(true)} className={BTN.primary}>
            Open approved draft in email
          </button>
        )}
      </div>
      {!state?.canSend && offerEmail && <p className="text-xs text-muted">“Open in email” becomes available after an admin approves this exact text.</p>}
      {message && <p className="text-xs text-plum" role="status">{message}</p>}

      <ConfirmDialog
        open={confirmSend}
        title="Open in your email app?"
        confirmLabel="Open email app"
        onCancel={() => setConfirmSend(false)}
        onConfirm={() => {
          setConfirmSend(false);
          if (sendHref) window.location.href = sendHref;
        }}
      >
        <p>This opens a new message in your own email app with the approved text. Nothing is sent until you press Send there. Double-check the recipient is a real, current contact.</p>
      </ConfirmDialog>
    </div>
  );
}
