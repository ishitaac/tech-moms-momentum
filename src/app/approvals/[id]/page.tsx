import { format } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ApprovalWorkspace, type WorkspaceItem } from "@/components/approvals/approval-workspace";
import { StatusPill } from "@/components/approvals/status-pill";
import { Card, PageHeader } from "@/components/ui";
import { contentTypeLabel, emailBlockedReason, isSyntheticFunder, STATUS_LABELS, type ApprovalStatus } from "@/lib/approvals/model";
import { approvalDetail } from "@/lib/approvals/queries";
import { canReview } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Review AI draft · Tech-Moms Funder Finder" };

const ACTION_LABELS: Record<string, string> = {
  created: "Created from AI draft",
  edited: "Edited",
  submitted: "Submitted for approval",
  approved: "Approved",
  changes_requested: "Changes requested",
  rejected: "Rejected",
  approval_invalidated: "Approval removed (content edited)",
  withdrawn_for_edit: "Pulled back to draft (edited during review)",
  opened_in_email: "Opened in email app (not sent by Funder Finder)",
};
const statusText = (s: ApprovalStatus | null) => (s ? STATUS_LABELS[s] : "—");

async function Detail({ params }: Pick<PageProps<"/approvals/[id]">, "params">) {
  const user = await requireUser();
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const item = await approvalDetail(id);
  if (!item) notFound();

  const isAuthor = item.createdById === user.id;
  const ownerOrAdmin = isAuthor || user.role === "admin";
  const workspace: WorkspaceItem = {
    id: item.id,
    status: item.status,
    version: item.version,
    contentHash: item.contentHash,
    subject: item.subject,
    body: item.body,
    funderName: item.funderName,
    canEdit: ownerOrAdmin && item.status !== "rejected",
    canSubmit: ownerOrAdmin && (item.status === "draft" || item.status === "changes_requested"),
    canReview: canReview(user.role) && !isAuthor && item.status === "pending_approval",
    reviewBlockedReason:
      item.status !== "pending_approval" ? null : !canReview(user.role) ? "Only an admin can approve, request changes or reject." : isAuthor ? "You created this, so another admin must review it." : null,
    emailBlockedReason: ownerOrAdmin ? emailBlockedReason(item) : "Only the author or an admin can use approved content.",
    synthetic: isSyntheticFunder(item.funderName),
  };

  return (
    <>
      <PageHeader
        title={item.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={item.status} />
            <span>{contentTypeLabel(item.contentType)}</span>
            <span aria-hidden="true">·</span>
            <span>Version {item.version}</span>
          </span>
        }
        actions={
          <Link href="/approvals" className="text-sm font-medium text-plum underline decoration-plum/40 underline-offset-4 hover:decoration-plum">
            ← All approvals
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ApprovalWorkspace item={workspace} />

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-base font-semibold text-plum">Details</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted">Funder</dt>
              <dd>
                <Link href={`/?funder=${item.funderId}`} className="font-medium text-plum underline decoration-plum/40 underline-offset-4">
                  {item.funderName}
                </Link>
                {workspace.synthetic && <span className="ml-1 text-xs text-muted">(demo/sample — never contacted)</span>}
              </dd>
              <dt className="text-muted">Creator</dt>
              <dd className="text-plum">{item.creatorName ?? "—"}</dd>
              <dt className="text-muted">Created</dt>
              <dd className="text-plum">{format(item.createdAt, "MMM d, yyyy h:mm a")}</dd>
              <dt className="text-muted">Submitted</dt>
              <dd className="text-plum">{item.submittedAt ? format(item.submittedAt, "MMM d, yyyy h:mm a") : "—"}</dd>
              <dt className="text-muted">Reviewer</dt>
              <dd className="text-plum">{item.reviewerName ?? "—"}</dd>
              <dt className="text-muted">Reviewed</dt>
              <dd className="text-plum">{item.reviewedAt ? format(item.reviewedAt, "MMM d, yyyy h:mm a") : "—"}</dd>
              <dt className="text-muted">Content ID</dt>
              <dd className="break-all font-mono text-xs text-plum" title="SHA-256 of the subject and body">
                {item.contentHash.slice(0, 12)}…
              </dd>
            </dl>
            {item.reviewNotes && (
              <div className="mt-4 rounded-[12px] border border-rose/40 bg-rose-tint p-3 text-sm text-plum">
                <p className="font-semibold">Reviewer notes</p>
                <p className="mt-1 whitespace-pre-wrap">{item.reviewNotes}</p>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-base font-semibold text-plum">Supporting context</h2>
            {item.requestInput?.purpose && (
              <p className="mb-2 text-sm text-plum">
                <span className="font-semibold">Funding purpose:</span> {item.requestInput.purpose}
                {item.requestInput.amount ? ` · ${item.requestInput.amount}` : ""}
              </p>
            )}
            {item.factsToVerify.length > 0 && (
              <>
                <p className="text-sm font-semibold text-plum">Facts to verify before use</p>
                <ul className="mb-3 mt-1 list-disc space-y-1 pl-5 text-sm text-plum">
                  {item.factsToVerify.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </>
            )}
            {item.sourceMaterial.length > 0 ? (
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-plum">Source material the AI was given ({item.sourceMaterial.length})</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
                  {item.sourceMaterial.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </details>
            ) : (
              <p className="text-sm text-muted">No source list was saved with this draft.</p>
            )}
          </Card>

          <Card id="history">
            <h2 className="mb-3 text-base font-semibold text-plum">Audit history</h2>
            <ol className="space-y-3">
              {item.events.map((e) => (
                <li key={e.id} className="border-l-2 border-plum/20 pl-3 text-sm">
                  <p className="font-medium text-plum">{ACTION_LABELS[e.action] ?? e.action}</p>
                  <p className="text-xs text-muted">
                    {e.actorName ?? "Unknown user"} · <time dateTime={e.createdAt.toISOString()}>{format(e.createdAt, "MMM d, yyyy h:mm a")}</time>
                  </p>
                  <p className="text-xs text-muted">
                    {statusText(e.fromStatus)} → {statusText(e.toStatus)} · v{e.version} · <span className="font-mono">{e.contentHash.slice(0, 8)}</span>
                  </p>
                  {e.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-plum">“{e.notes}”</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function ApprovalDetailPage({ params }: PageProps<"/approvals/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-[16px] bg-card" />}>
      <Detail params={params} />
    </Suspense>
  );
}
