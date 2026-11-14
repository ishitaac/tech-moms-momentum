import { format } from "date-fns";
import Link from "next/link";
import { Suspense } from "react";
import { ApprovalIcon } from "@/components/icons";
import { ReviewStatusPill } from "@/components/approvals/status-pill";
import { BTN, CARD, PageHeader } from "@/components/ui";
import { CONTENT_TYPE_LABEL, isReviewStatus, REVIEW_STATUSES, STATUS_LABEL, type ReviewStatus } from "@/lib/approvals/model";
import { listReviews, reviewCounts } from "@/lib/approvals/service";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";

const SKELETON = <div className="h-80 animate-pulse rounded-[16px] bg-card" />;
const FILTERS: (ReviewStatus | "all")[] = ["pending_approval", "changes_requested", "approved", "rejected", "draft", "all"];
const date = (iso: string | null) => (iso ? format(new Date(iso), "MMM d, yyyy") : "—");

async function Queue({ searchParams }: Pick<PageProps<"/approvals">, "searchParams">) {
  const user = await requireUser("review:view");
  const raw = (await searchParams).status;
  const status: ReviewStatus | null = raw === "all" ? null : isReviewStatus(raw) ? raw : "pending_approval";
  const [rows, counts] = await Promise.all([listReviews(status), reviewCounts()]);
  const total = REVIEW_STATUSES.reduce((n, s) => n + counts[s], 0);
  const reviewer = can(user.rawRole, "review:decide");

  return (
    <>
      <div className={`${CARD} mb-6 flex flex-wrap items-center gap-4 p-5`}>
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-plum-tint text-plum">
          <ApprovalIcon className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="text-sm text-muted">Waiting for approval</p>
          <p className="text-2xl font-medium tabular-nums text-plum">{counts.pending_approval}</p>
        </div>
        <p className="max-w-md text-sm text-muted">
          {reviewer
            ? "You can approve, request changes or reject. Approving never sends anything — sending stays a separate step."
            : "Admins review what you submit. You'll see their decision and notes here."}
        </p>
      </div>

      <nav aria-label="Filter by status" className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = (f === "all" && status === null) || f === status;
          const n = f === "all" ? total : counts[f];
          return (
            <Link
              key={f}
              href={f === "pending_approval" ? "/approvals" : `/approvals?status=${f}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${active ? "border-plum bg-plum text-white" : "border-line bg-card text-plum hover:bg-plum-tint"}`}
            >
              {f === "all" ? "All" : STATUS_LABEL[f]} <span className="tabular-nums opacity-80">({n})</span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className={`${CARD} flex flex-col items-center px-6 py-14 text-center`}>
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-tint text-plum">
            <ApprovalIcon className="h-7 w-7" />
          </span>
          <h2 className="mt-5 text-section font-semibold text-plum">{status === "pending_approval" ? "Nothing is waiting for approval." : "Nothing here yet."}</h2>
          <p className="mt-2 max-w-sm text-body text-muted">
            AI drafts appear here after someone saves one and chooses “Submit for approval” in a funder’s outreach assistant.
          </p>
          <Link href="/" className={`${BTN.primary} mt-6`}>
            Go to funders
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className={`${CARD} hidden overflow-x-auto md:block`}>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">AI-generated content and its approval status</caption>
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Content</th>
                  <th scope="col" className="px-3 py-3 font-medium">Type</th>
                  <th scope="col" className="px-3 py-3 font-medium">Created by</th>
                  <th scope="col" className="px-3 py-3 font-medium">Created</th>
                  <th scope="col" className="px-3 py-3 font-medium">Status</th>
                  <th scope="col" className="px-3 py-3 font-medium">Reviewer</th>
                  <th scope="col" className="px-5 py-3 font-medium"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="max-w-xs px-5 py-3.5 font-medium text-plum">{r.title}</td>
                    <td className="px-3 py-3.5 text-muted">{CONTENT_TYPE_LABEL[r.contentType] ?? r.contentType}</td>
                    <td className="px-3 py-3.5">{r.createdBy ?? "—"}</td>
                    <td className="px-3 py-3.5 tabular-nums text-muted">{date(r.createdAt)}</td>
                    <td className="px-3 py-3.5"><ReviewStatusPill status={r.status} /></td>
                    <td className="px-3 py-3.5">{r.reviewer ?? <span className="text-muted">—</span>}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href={`/approvals/${r.id}`} className={BTN.link} aria-label={`${reviewer && r.status === "pending_approval" ? "Review" : "View"}: ${r.title}`}>
                        {reviewer && r.status === "pending_approval" ? "Review" : "View"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phone cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className={`${CARD} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-plum">{r.title}</p>
                  <ReviewStatusPill status={r.status} />
                </div>
                <p className="mt-1 text-sm text-muted">
                  {CONTENT_TYPE_LABEL[r.contentType] ?? r.contentType} · {r.createdBy ?? "Unknown"} · {date(r.createdAt)}
                </p>
                {r.reviewer && <p className="mt-1 text-sm text-muted">Reviewer: {r.reviewer}</p>}
                <Link href={`/approvals/${r.id}`} className={`${BTN.secondary} mt-3 w-full`}>
                  {reviewer && r.status === "pending_approval" ? "Review" : "View"}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export default function ApprovalsPage(props: PageProps<"/approvals">) {
  return (
    <>
      <PageHeader title="Approvals" subtitle="AI writes drafts. People review and approve them before anything goes to a funder." />
      <Suspense fallback={SKELETON}>
        <Queue searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
