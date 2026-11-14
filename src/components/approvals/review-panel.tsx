"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideReview, saveReviewEdit } from "@/app/approval-actions";
import { BTN, CARD } from "@/components/ui";
import { MAX_BODY_CHARS, MAX_NOTE_CHARS, type ReviewStatus } from "@/lib/approvals/model";
import { ConfirmDialog } from "./confirm-dialog";

type Decision = "approve" | "request_changes" | "reject";

const DECISION: Record<Decision, { label: string; title: string; text: string }> = {
  approve: {
    label: "Approve",
    title: "Approve this content?",
    text: "You confirm you've checked every fact. Approving does not send anything — someone still has to send it themselves. If the text is edited later, approval is cleared automatically.",
  },
  request_changes: { label: "Request changes", title: "Send back for changes?", text: "The author will see your note and can edit and resubmit." },
  reject: { label: "Reject", title: "Reject this content?", text: "Rejected content can't be resubmitted. The author can create a new draft instead." },
};

interface Props {
  reviewId: number;
  body: string;
  currentHash: string;
  status: ReviewStatus;
  canDecide: boolean;
  canEditAsReviewer: boolean;
  canEditAsAuthor: boolean;
}

export function ReviewPanel({ reviewId, body, currentHash, status, canDecide, canEditAsReviewer, canEditAsAuthor }: Props) {
  const router = useRouter();
  const [text, setText] = useState(body);
  // After a save/decision the server sends the new stored body; adopt it (React's "adjust state on prop change").
  const [syncedBody, setSyncedBody] = useState(body);
  if (body !== syncedBody) {
    setSyncedBody(body);
    setText(body);
  }
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<Decision | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const editable = (status === "pending_approval" && canEditAsReviewer) || ((status === "draft" || status === "changes_requested") && canEditAsAuthor);
  const dirty = text !== body;
  const deciding = status === "pending_approval" && canDecide;
  const noteMissing = confirm !== null && confirm !== "approve" && !note.trim();

  function save(resubmit: boolean) {
    start(async () => {
      setMessage(null);
      const r = await saveReviewEdit({ reviewId, body: text, expectedHash: currentHash, resubmit });
      if (!r.ok) return setMessage({ tone: "error", text: r.error });
      setMessage({ tone: "ok", text: resubmit ? "Saved and resubmitted for approval." : "Edits saved." });
      router.refresh();
    });
  }

  function decideNow() {
    if (!confirm) return;
    const action = confirm;
    start(async () => {
      const r = await decideReview({ reviewId, action, reviewedHash: currentHash, note: note.trim() || null });
      setConfirm(null);
      if (!r.ok) return setMessage({ tone: "error", text: r.error });
      setNote("");
      setMessage({ tone: "ok", text: action === "approve" ? "Approved. Nothing has been sent." : action === "reject" ? "Rejected." : "Sent back to the author with your note." });
      router.refresh();
    });
  }

  return (
    <section className={`${CARD} p-5 sm:p-6`} aria-labelledby="content-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="content-heading" className="text-section font-semibold">
          Generated content
        </h2>
        <p className="text-xs text-muted">AI-written starting point — check every fact.</p>
      </div>

      {editable ? (
        <>
          <label htmlFor="review-body" className="sr-only">
            Content (editable)
          </label>
          <textarea
            id="review-body"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_BODY_CHARS}
            rows={18}
            className="w-full rounded-[12px] border border-line bg-card p-3 text-body leading-relaxed text-plum"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => save(false)} disabled={!dirty || pending} className={BTN.secondary}>
              Save edits
            </button>
            {status !== "pending_approval" && (
              <button type="button" onClick={() => save(true)} disabled={pending || !text.trim()} className={BTN.primary}>
                {dirty ? "Save & resubmit for approval" : "Resubmit for approval"}
              </button>
            )}
            {dirty && <span className="text-sm text-muted">Unsaved changes</span>}
          </div>
        </>
      ) : (
        <div className="whitespace-pre-wrap rounded-[12px] border border-line bg-page p-4 text-body leading-relaxed text-plum">{body}</div>
      )}

      {deciding && (
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-base font-semibold">Your decision</h3>
          <label htmlFor="review-note" className="mt-3 mb-1.5 block text-sm font-semibold text-plum">
            Reviewer notes <span className="font-normal text-muted">(required to reject or request changes)</span>
          </label>
          <textarea
            id="review-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MAX_NOTE_CHARS}
            rows={3}
            className="w-full rounded-[12px] border border-line bg-card p-3 text-sm text-plum"
            placeholder="What's good, what to fix, which facts to double-check…"
          />
          {dirty && <p className="mt-2 text-sm text-plum">Save or undo your edits before deciding, so you approve exactly what&apos;s stored.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setConfirm("approve")} disabled={pending || dirty} className={BTN.primary}>
              Approve
            </button>
            <button type="button" onClick={() => setConfirm("request_changes")} disabled={pending || dirty} className={BTN.secondary}>
              Request changes
            </button>
            <button type="button" onClick={() => setConfirm("reject")} disabled={pending || dirty} className={BTN.soft}>
              Reject
            </button>
          </div>
        </div>
      )}

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`mt-4 rounded-[12px] border px-4 py-3 text-sm text-plum ${message.tone === "error" ? "border-rose/50 bg-rose-tint" : "border-teal/50 bg-teal-tint"}`}>
          {message.text}
        </p>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm ? DECISION[confirm].title : ""}
        confirmLabel={confirm ? DECISION[confirm].label : ""}
        confirmDisabled={noteMissing}
        busy={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={decideNow}
      >
        <p>{confirm ? DECISION[confirm].text : ""}</p>
        {noteMissing && <p className="mt-3 font-medium text-plum">Add a reviewer note first so the author knows what to change.</p>}
      </ConfirmDialog>
    </section>
  );
}
