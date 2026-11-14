import { format } from "date-fns";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReviewPanel } from "@/components/approvals/review-panel";
import { ReviewStatusPill } from "@/components/approvals/status-pill";
import { CARD, PageHeader, shortDate, SourceLink, softenCaps, typeLabel } from "@/components/ui";
import { ACTION_LABEL, CONTENT_TYPE_LABEL, isReviewStatus, type ReviewAction } from "@/lib/approvals/model";
import { reviewDetail } from "@/lib/approvals/service";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";

const when = (d: Date | null) => (d ? format(d, "MMM d, yyyy · h:mm a") : "—");

/** Pulls the human-readable facts each existing draft flow stored in drafts.source_material. */
function sourceFacts(sm: unknown): { facts: string[]; verify: string[]; model: string | null } {
  if (!sm || typeof sm !== "object") return { facts: [], verify: [], model: null };
  const o = sm as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const facts = [...list(o.sourceMaterial), ...list(o.funderFacts)];
  return { facts, verify: list(o.factsToVerify), model: typeof o.model === "string" ? o.model : null };
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-plum">{children}</dd>
    </div>
  );
}

async function Detail({ params }: Pick<PageProps<"/approvals/[id]">, "params">) {
  const user = await requireUser("review:view");
  const id = Number((await params).id);
  const d = await reviewDetail(id);
  if (!d) notFound();
  const { review } = d;
  const { facts, verify, model } = sourceFacts(d.sourceMaterial);

  return (
    <>
      <p className="mb-3">
        <Link href="/approvals" className="text-sm font-medium text-plum underline decoration-plum/40 underline-offset-4">
          ← Back to approvals
        </Link>
      </p>
      <PageHeader title={review.title} subtitle={CONTENT_TYPE_LABEL[review.contentType] ?? review.contentType} actions={<ReviewStatusPill status={review.status} />} />

      {review.reviewNotes && (review.status === "changes_requested" || review.status === "rejected" || review.status === "approved") && (
        <div role="note" className="mb-6 rounded-[12px] border border-rose/40 bg-rose-tint px-5 py-4 text-plum">
          <p className="text-sm font-semibold">Reviewer notes{d.reviewerName ? ` from ${d.reviewerName}` : ""}</p>
          <p className="mt-1 whitespace-pre-wrap text-body">{review.reviewNotes}</p>
        </div>
      )}
      {review.status === "approved" && (
        <div role="note" className="mb-6 rounded-[12px] border border-teal/50 bg-teal-tint px-5 py-4 text-sm text-plum">
          Approved content is not sent automatically. Send it yourself from the funder’s outreach assistant, after a final check.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ReviewPanel
          reviewId={review.id}
          body={d.body}
          currentHash={d.currentHash}
          status={isReviewStatus(review.status) ? review.status : "draft"}
          canDecide={can(user.rawRole, "review:decide")}
          canEditAsReviewer={can(user.rawRole, "review:edit-as-reviewer")}
          canEditAsAuthor={can(user.rawRole, "draft:edit")}
        />

        <aside className="space-y-6">
          <section className={`${CARD} p-5`} aria-labelledby="status-heading">
            <h2 id="status-heading" className="mb-3 text-base font-semibold">Review status</h2>
            <dl className="space-y-3">
              <Meta label="Status"><ReviewStatusPill status={review.status} /></Meta>
              <Meta label="Created by">{d.authorName ?? d.submitterName ?? "Unknown"}</Meta>
              <Meta label="Submitted">{d.submitterName ? `${d.submitterName} · ` : ""}{when(review.submittedAt)}</Meta>
              <Meta label="Reviewer">{d.reviewerName ? `${d.reviewerName} · ${when(review.reviewedAt)}` : "Not reviewed yet"}</Meta>
              <Meta label="Content fingerprint">
                <code className="text-xs text-muted" title={d.currentHash}>{d.currentHash.slice(0, 12)}</code>
              </Meta>
            </dl>
          </section>

          <section className={`${CARD} p-5`} aria-labelledby="context-heading">
            <h2 id="context-heading" className="mb-3 text-base font-semibold">Funding context</h2>
            <dl className="space-y-3">
              <Meta label="Funder">{softenCaps(d.funderName)}</Meta>
              <Meta label="Type">{typeLabel(d.funderType)}</Meta>
              {(d.funderCity || d.funderState) && <Meta label="Location">{[d.funderCity, d.funderState].filter(Boolean).join(", ")}</Meta>}
              {d.opportunity && (
                <Meta label="Opportunity">
                  {d.opportunity.title}
                  {d.opportunity.deadline && <span className="text-muted"> · due {shortDate(d.opportunity.deadline)}</span>}
                  <span className="block"><SourceLink href={d.opportunity.sourceUrl}>Listing</SourceLink></span>
                </Meta>
              )}
              {d.funderWebsite && <Meta label="Website"><SourceLink href={d.funderWebsite}>Funder website</SourceLink></Meta>}
            </dl>
          </section>

          <section className={`${CARD} p-5`} aria-labelledby="source-heading">
            <h2 id="source-heading" className="mb-3 text-base font-semibold">Source material</h2>
            {verify.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-plum">Facts to verify</p>
                <ul className="mt-1 mb-4 list-disc space-y-1 pl-5 text-sm text-plum">{verify.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </>
            )}
            {facts.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
            ) : (
              <p className="text-sm text-muted">No source material was stored with this draft.</p>
            )}
            {model && <p className="mt-3 text-xs text-muted">Model: {model}</p>}
          </section>

          <section className={`${CARD} p-5`} aria-labelledby="history-heading">
            <h2 id="history-heading" className="mb-3 text-base font-semibold">Approval history</h2>
            {d.history.length === 0 ? (
              <p className="text-sm text-muted">No activity yet.</p>
            ) : (
              <ol className="space-y-3">
                {d.history.map((h) => (
                  <li key={h.id} className="border-l-2 border-line pl-3">
                    <p className="text-sm font-medium text-plum">{ACTION_LABEL[h.action as ReviewAction] ?? h.action}</p>
                    <p className="text-xs text-muted">{h.actorName ?? "Unknown"} · {when(h.createdAt)}</p>
                    {h.note && <p className="mt-1 whitespace-pre-wrap text-sm text-plum">{h.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

export default function ApprovalDetailPage(props: PageProps<"/approvals/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-[16px] bg-card" />}>
      <Detail params={props.params} />
    </Suspense>
  );
}
