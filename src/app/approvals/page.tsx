import { format } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StatusPill } from "@/components/approvals/status-pill";
import { SubmitDraftButton } from "@/components/approvals/submit-draft-button";
import { CARD, PageHeader } from "@/components/ui";
import { APPROVAL_STATUSES, contentTypeLabel, STATUS_LABELS, type ApprovalStatus } from "@/lib/approvals/model";
import { listApprovals, parseStatusFilter, statusCounts, unsubmittedDrafts, type ApprovalRow } from "@/lib/approvals/queries";
import { canReview } from "@/lib/auth/roles";
import { requireUser, type CurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Approvals · Tech-Moms Funder Finder" };

const when = (d: Date) => format(d, "MMM d, yyyy");

function actionFor(row: ApprovalRow, user: CurrentUser): string {
  if (row.status === "pending_approval" && canReview(user.role) && row.createdById !== user.id) return "Review";
  if ((row.status === "draft" || row.status === "changes_requested") && (row.createdById === user.id || user.role === "admin")) return "Edit & submit";
  return "View";
}

function Tabs({ active, counts }: { active: ApprovalStatus | null; counts: Record<ApprovalStatus, number> }) {
  const all = Object.values(counts).reduce((s, n) => s + n, 0);
  const tabs: { key: ApprovalStatus | null; label: string; n: number }[] = [
    { key: null, label: "All", n: all },
    ...APPROVAL_STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s], n: counts[s] })),
  ];
  return (
    <nav aria-label="Filter by status" className="mb-6 flex flex-wrap gap-2">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.label}
            href={t.key ? `/approvals?status=${t.key}` : "/approvals"}
            aria-current={on ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${on ? "border-plum bg-plum text-white" : "border-line bg-card text-plum hover:bg-plum-tint"}`}
          >
            {t.label} <span className="tabular-nums">({t.n})</span>
          </Link>
        );
      })}
    </nav>
  );
}

async function Queue({ searchParams }: Pick<PageProps<"/approvals">, "searchParams">) {
  const user = await requireUser();
  const status = parseStatusFilter((await searchParams).status);
  const [rows, counts, saved] = await Promise.all([listApprovals(status), statusCounts(), unsubmittedDrafts()]);

  return (
    <>
      {saved.length > 0 && (
        <section aria-labelledby="saved-drafts" className={`${CARD} mb-8 p-5`}>
          <h2 id="saved-drafts" className="text-lg font-medium text-plum">
            Saved AI drafts not yet in review ({saved.length})
          </h2>
          <p className="mt-1 text-sm text-muted">The latest saved draft for each funder. Submit one to send it to an admin.</p>
          <ul className="mt-4 divide-y divide-line">
            {saved.map((d) => (
              <li key={d.draftId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-plum">
                    {contentTypeLabel(d.contentType)} — {d.funderName}
                  </p>
                  <p className="truncate text-sm text-muted">{d.subject || d.preview}</p>
                  <p className="text-xs text-muted">Saved {when(d.updatedAt)}</p>
                </div>
                <SubmitDraftButton draftId={d.draftId} label={`${contentTypeLabel(d.contentType)} for ${d.funderName}`} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <h2 className="sr-only">Approval queue</h2>
      <Tabs active={status} counts={counts} />
      {rows.length === 0 ? (
        <div className={`${CARD} p-8 text-center`}>
          <p className="text-lg font-medium text-plum">{status ? `Nothing is ${STATUS_LABELS[status].toLowerCase()}.` : "No AI drafts yet."}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Open a funder, use the Outreach Assistant to create a draft, then choose <strong className="text-plum">Submit for approval</strong>. It will show up here for an admin to review.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-plum underline decoration-plum/40 underline-offset-4 hover:decoration-plum">
            Go to Funders
          </Link>
        </div>
      ) : (
        <>
          {/* Phones: cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className={`${CARD} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/approvals/${r.id}`} className="font-medium text-plum underline decoration-plum/30 underline-offset-4">
                    {r.title}
                  </Link>
                  <StatusPill status={r.status} />
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
                  <dt>Type</dt>
                  <dd className="text-plum">{contentTypeLabel(r.contentType)}</dd>
                  <dt>Creator</dt>
                  <dd className="text-plum">{r.creatorName ?? "—"}</dd>
                  <dt>Updated</dt>
                  <dd className="text-plum">{when(r.updatedAt)}</dd>
                  <dt>Reviewer</dt>
                  <dd className="text-plum">{r.reviewerName ?? "—"}</dd>
                </dl>
                <Link href={`/approvals/${r.id}`} aria-label={`${actionFor(r, user)}: ${r.title}`} className="mt-3 inline-block text-sm font-semibold text-plum underline decoration-plum/40 underline-offset-4">
                  {actionFor(r, user)}
                </Link>
              </li>
            ))}
          </ul>
          {/* Wider screens: table */}
          <div className={`${CARD} hidden overflow-x-auto md:block`}>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">AI-generated content and its approval status</caption>
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Content</th>
                  <th scope="col" className="px-4 py-3 font-medium">Type</th>
                  <th scope="col" className="px-4 py-3 font-medium">Creator</th>
                  <th scope="col" className="px-4 py-3 font-medium">Date</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Reviewer</th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3 font-medium text-plum">{r.title}</td>
                    <td className="px-4 py-3 text-muted">{contentTypeLabel(r.contentType)}</td>
                    <td className="px-4 py-3 text-plum">{r.creatorName ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      <time dateTime={r.updatedAt.toISOString()}>{when(r.updatedAt)}</time>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-plum">{r.reviewerName ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link href={`/approvals/${r.id}`} aria-label={`${actionFor(r, user)}: ${r.title}`} className="rounded-full border border-plum/30 px-3 py-1.5 text-sm font-semibold text-plum hover:bg-plum-tint">
                        {actionFor(r, user)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

export default function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Every AI-written draft is reviewed by a person before anyone uses it. Approving never sends anything."
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[16px] bg-card" />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </>
  );
}
