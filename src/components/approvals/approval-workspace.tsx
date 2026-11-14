"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { editApprovalContent, prepareApprovedEmail, reviewApproval, submitForApproval } from "@/app/approval-actions";
import { BTN, Card } from "@/components/ui";
import { DECISION_LABELS, MAX_BODY_CHARS, MAX_NOTES_CHARS, MAX_SUBJECT_CHARS, type ApprovalStatus, type ReviewDecision } from "@/lib/approvals/model";
import { ConfirmDialog } from "./confirm-dialog";

export interface WorkspaceItem {
  id: number;
  status: ApprovalStatus;
  version: number;
  contentHash: string;
  subject: string;
  body: string;
  funderName: string;
  canEdit: boolean;
  canSubmit: boolean;
  canReview: boolean;
  reviewBlockedReason: string | null;
  emailBlockedReason: string | null;
  synthetic: boolean;
}

type Confirm = { kind: "save" } | { kind: "submit" } | { kind: "review"; decision: ReviewDecision } | { kind: "email" } | null;
type Feedback = { tone: "success" | "error"; text: string } | null;

const field = "w-full rounded-[12px] border border-control bg-card p-3 text-sm text-plum focus:border-plum focus:outline-none focus:ring-2 focus:ring-plum/30 read-only:bg-plum-tint/40";
const label = "mb-1 block text-sm font-semibold text-plum";

const REVIEW_COPY: Record<ReviewDecision, { title: string; body: string; done: string }> = {
  approve: {
    title: "Approve this content?",
    body: "You're confirming you read this exact version and the facts are accurate. Approval does not send anything. Using it outside the app is a separate step.",
    done: "Approved. Nothing was sent.",
  },
  request_changes: {
    title: "Request changes?",
    body: "It goes back to the author with your notes. They can edit and submit again.",
    done: "Changes requested. The author can see your notes.",
  },
  reject: {
    title: "Reject this content?",
    body: "Rejected content becomes read-only and can't be used. This can't be undone.",
    done: "Rejected.",
  },
};

export function ApprovalWorkspace({ item }: { item: WorkspaceItem }) {
  const router = useRouter();
  const [subject, setSubject] = useState(item.subject);
  const [body, setBody] = useState(item.body);
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, start] = useTransition();

  const dirty = subject !== item.subject || body !== item.body;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      try {
        const r = await fn();
        setConfirm(null);
        if (!r.ok) {
          setFeedback({ tone: "error", text: r.error ?? "Something went wrong." });
          return;
        }
        setFeedback({ tone: "success", text: done });
        setNotes("");
        router.refresh();
      } catch {
        setConfirm(null);
        setFeedback({ tone: "error", text: "Could not reach the server. Nothing was changed." });
      }
    });

  const save = () =>
    run(async () => editApprovalContent({ id: item.id, expectedVersion: item.version, subject, body }), item.status === "approved" ? "Saved. The approval was removed; submit it again when ready." : "Changes saved.");

  const submit = () => run(() => submitForApproval({ id: item.id, expectedVersion: item.version }), "Submitted. An admin will review it.");

  const review = (decision: ReviewDecision) =>
    run(() => reviewApproval({ id: item.id, expectedVersion: item.version, expectedHash: item.contentHash, decision, notes }), REVIEW_COPY[decision].done);

  const openEmail = () =>
    start(async () => {
      try {
        const r = await prepareApprovedEmail({ id: item.id, expectedVersion: item.version, expectedHash: item.contentHash });
        setConfirm(null);
        if (!r.ok) return setFeedback({ tone: "error", text: r.error });
        setFeedback({ tone: "success", text: "Opening your email app. Nothing is sent until you press Send there." });
        window.location.href = r.data.href;
        router.refresh();
      } catch {
        setConfirm(null);
        setFeedback({ tone: "error", text: "Could not reach the server." });
      }
    });

  const onConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === "save") save();
    else if (confirm.kind === "submit") submit();
    else if (confirm.kind === "review") review(confirm.decision);
    else openEmail();
  };

  const needsNotes = (d: ReviewDecision) => d !== "approve" && notes.trim().length === 0;

  return (
    <div className="space-y-6">
      {feedback && (
        <div role={feedback.tone === "error" ? "alert" : "status"} className={`rounded-[12px] border px-4 py-3 text-sm text-plum ${feedback.tone === "error" ? "border-rose bg-rose-tint" : "border-teal-strong bg-teal-tint"}`}>
          <span className="font-semibold">{feedback.tone === "error" ? "Error:" : "Done:"}</span> {feedback.text}
        </div>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-plum">Content</h2>
          <p className="text-xs text-muted">AI-generated. Check every fact before approving.</p>
        </div>
        {item.status === "approved" && item.canEdit && (
          <p className="mb-3 rounded-[12px] border border-plum/20 bg-plum-tint px-3 py-2 text-sm text-plum">This version is approved. Editing it removes the approval and it must be reviewed again.</p>
        )}
        {item.status === "rejected" && <p className="mb-3 rounded-[12px] border border-line bg-plum-tint px-3 py-2 text-sm text-plum">Rejected content is read-only.</p>}
        <div className="space-y-4">
          <div>
            <label htmlFor="approval-subject" className={label}>
              Subject
            </label>
            <input id="approval-subject" value={subject} onChange={(e) => setSubject(e.target.value)} readOnly={!item.canEdit} maxLength={MAX_SUBJECT_CHARS} className={field} />
          </div>
          <div>
            <label htmlFor="approval-body" className={label}>
              Full text
            </label>
            <textarea id="approval-body" value={body} onChange={(e) => setBody(e.target.value)} readOnly={!item.canEdit} maxLength={MAX_BODY_CHARS} rows={18} className={`${field} leading-relaxed`} />
            <p className="mt-1 text-right text-xs text-muted tabular-nums">{body.length.toLocaleString()} characters</p>
          </div>
        </div>
        {(item.canEdit || item.canSubmit) && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {item.canEdit && (
              <button type="button" className={BTN.secondary} disabled={pending || !dirty || body.trim().length === 0} onClick={() => (item.status === "approved" || item.status === "pending_approval" ? setConfirm({ kind: "save" }) : save())}>
                Save changes
              </button>
            )}
            {item.canSubmit && (
              <button type="button" className={BTN.primary} disabled={pending || dirty} onClick={() => setConfirm({ kind: "submit" })} title={dirty ? "Save your changes first" : undefined}>
                Submit for approval
              </button>
            )}
            {dirty && <p className="text-xs text-muted">Unsaved changes.{item.canSubmit ? " Save before submitting." : ""}</p>}
          </div>
        )}
      </Card>

      {item.status === "pending_approval" && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-plum">Review</h2>
          {item.canReview ? (
            <>
              <p className="mb-3 text-sm text-muted">Your decision applies to version {item.version}, exactly as shown above.</p>
              <label htmlFor="review-notes" className={label}>
                Review notes <span className="font-normal text-muted">(required to request changes or reject)</span>
              </label>
              <textarea id="review-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={MAX_NOTES_CHARS} rows={4} className={field} />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={BTN.primary} disabled={pending || dirty} onClick={() => setConfirm({ kind: "review", decision: "approve" })}>
                  {DECISION_LABELS.approve}
                </button>
                <button type="button" className={BTN.secondary} disabled={pending || needsNotes("request_changes")} onClick={() => setConfirm({ kind: "review", decision: "request_changes" })}>
                  {DECISION_LABELS.request_changes}
                </button>
                <button type="button" className={BTN.soft} disabled={pending || needsNotes("reject")} onClick={() => setConfirm({ kind: "review", decision: "reject" })}>
                  {DECISION_LABELS.reject}
                </button>
              </div>
              {notes.trim().length === 0 && <p className="mt-2 text-xs text-muted">Add a note to enable Request changes and Reject.</p>}
            </>
          ) : (
            <p className="text-sm text-muted">{item.reviewBlockedReason ?? "Waiting for an admin to review."}</p>
          )}
        </Card>
      )}

      {item.status === "approved" && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-plum">Use approved content</h2>
          <p className="mb-3 text-sm text-muted">Funder Finder never sends messages or submits applications. You can open this in your own email app and decide there.</p>
          {item.emailBlockedReason ? (
            <p className="rounded-[12px] border border-line bg-plum-tint px-3 py-2 text-sm text-plum">{item.emailBlockedReason}</p>
          ) : (
            <button type="button" className={BTN.secondary} disabled={pending || dirty} onClick={() => setConfirm({ kind: "email" })}>
              Open in my email app…
            </button>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={confirm !== null}
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={onConfirm}
        title={
          confirm?.kind === "review"
            ? REVIEW_COPY[confirm.decision].title
            : confirm?.kind === "submit"
              ? "Submit for approval?"
              : confirm?.kind === "email"
                ? "Open in your email app?"
                : "Save changes?"
        }
        confirmLabel={
          confirm?.kind === "review" ? DECISION_LABELS[confirm.decision] : confirm?.kind === "submit" ? "Submit" : confirm?.kind === "email" ? "Open email app" : "Save changes"
        }
      >
        {confirm?.kind === "review" && <p>{REVIEW_COPY[confirm.decision].body}</p>}
        {confirm?.kind === "submit" && <p>An admin other than you will review version {item.version}. You can still edit it, but editing pulls it back to draft.</p>}
        {confirm?.kind === "save" && (
          <p>{item.status === "approved" ? "Saving removes the current approval. It must be submitted and approved again." : "Saving pulls this back to draft. Submit it again when ready."}</p>
        )}
        {confirm?.kind === "email" && (
          <>
            <p>Your email app opens with the approved subject and text, with no recipient filled in. Nothing is sent until you press Send there.</p>
            <p>This step is recorded in the audit history.</p>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
