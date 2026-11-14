"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { loadFunderDetail } from "@/app/actions";
import { COMPONENT_KEYS, COMPONENT_LABELS } from "@/config/scoring";
import type { FunderDetail, ListRow } from "@/lib/queries";
import { CloseIcon } from "@/components/icons";
import { BandBadge, OpenCallBadge, ScoreBadge, SourceLink, shortDate, softenCaps, typeLabel, usd } from "@/components/ui";
import { ActionButtons, NotAFitButton } from "./action-buttons";
import { OutreachPanel } from "./outreach-panel";

interface Props {
  row: ListRow;
  onClose: () => void;
  showPeople: boolean;
  showDraft: boolean;
}

const MAX_BULLETS = 4;
const MAX_BULLET_CHARS = 150;

/** Turns a long block of filing/application text into a few short, readable points. */
function toBullets(text: string | null | undefined, max = MAX_BULLETS): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.;!?])\s+|\n+|•/)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 3)
    .slice(0, max)
    .map((t) => (t.length > MAX_BULLET_CHARS ? `${t.slice(0, MAX_BULLET_CHARS - 1).trimEnd()}…` : t));
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function Bullets({ items, empty }: { items: string[]; empty?: string }) {
  if (items.length === 0) return empty ? <p className="text-muted">{empty}</p> : null;
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-teal">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group border-t border-line py-4 first:border-t-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-[17px] font-semibold text-plum [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden="true" className="text-xl leading-none text-muted transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="mt-3 space-y-4 text-body leading-relaxed text-plum">{children}</div>
    </details>
  );
}

export function FunderDrawer({ row, onClose, showPeople, showDraft }: Props) {
  const [detail, setDetail] = useState<FunderDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    // The parent remounts this panel per funder (key), so state starts fresh for each.
    let cancelled = false;
    loadFunderDetail(row.funderId).then((d) => !cancelled && setDetail(d));
    return () => {
      cancelled = true;
    };
  }, [row.funderId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const opp = detail?.opportunities.find((o) => o.id === row.opportunityId) ?? detail?.opportunities.find((o) => o.isOpen === "open");
  const openOpp = opp && opp.isOpen === "open" ? opp : null;
  const website = row.website ? (row.website.startsWith("http") ? row.website : `https://${row.website}`) : null;

  // Typical grant: the open call's stated range, otherwise the middle of their past grants.
  let typical: string | null = null;
  if (detail) {
    if (openOpp && (openOpp.awardMin || openOpp.awardMax)) {
      typical = [openOpp.awardMin, openOpp.awardMax].filter(Boolean).map((n) => usd(n)).join(" – ");
    } else {
      const m = median(detail.topGrants.map((g) => g.amount ?? 0).filter((n) => n > 0));
      typical = m ? `About ${usd(m)}` : null;
    }
  }

  const focusBullets = (["mission", "women", "geography"] as const)
    .map((k) => row.components[k])
    .filter((c) => c.score !== null && c.evidence)
    .flatMap((c) => toBullets(softenCaps(c.evidence), 1));
  const eligibilityBullets = toBullets(openOpp?.eligibility);
  const evidenceBullets = (["history", "access"] as const)
    .map((k) => row.components[k])
    .filter((c) => c.score !== null && c.evidence)
    .flatMap((c) => toBullets(c.evidence, 1));

  const sourceLinks: { href: string; label: string }[] = [];
  const addSource = (href: string | null | undefined, label: string) => {
    if (href && !sourceLinks.some((s) => s.href === href)) sourceLinks.push({ href, label });
  };
  addSource(row.reasonSourceUrl, row.filingYear ? `Tax filing, ${row.filingYear}` : "Main source");
  addSource(openOpp?.sourceUrl, "Funder’s application page");
  addSource(detail?.applicationSourceUrl, "Application details");
  addSource(detail?.filing?.sourceUrl, detail?.filing ? `Tax filing, ${detail.filing.taxYear}` : "Tax filing");
  for (const k of COMPONENT_KEYS) addSource(row.components[k].sourceUrl, `${COMPONENT_LABELS[k]} evidence`);
  addSource(website, "Funder’s website");

  const hasApplication = !!(openOpp || detail?.applicationInfo);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={`${row.name} details`}>
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-plum/30" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-card shadow-2xl">
        <div className="sticky top-0 z-10 flex justify-end bg-card px-4 pt-4">
          <button ref={closeRef} type="button" onClick={onClose} className="rounded-full p-2 text-plum hover:bg-plum-tint" aria-label="Close details">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Summary: everything that matters, without a single click */}
        <section className="px-6 pb-6">
          <h2 className="text-2xl font-semibold leading-snug text-plum">{row.name}</h2>
          <p className="mt-1 text-body text-muted">
            {typeLabel(row.type)} · {row.state === "UT" ? "Utah" : "National"}
          </p>

          <div className="mt-5 flex items-center gap-4">
            <ScoreBadge total={row.total} band={row.band} />
            <div className="space-y-1.5">
              <BandBadge band={row.band} />
              <p className="text-sm text-muted">{row.total !== null ? `Fit score ${row.total} out of 100` : "No fit score yet"}</p>
            </div>
          </div>

          <p className="mt-5 text-body leading-relaxed text-plum">
            <span className="font-semibold">{row.excludedReason ? "Why it’s hidden: " : "Why it matches: "}</span>
            {softenCaps(row.excludedReason ?? row.reason)}
          </p>

          <dl className="mt-5 grid grid-cols-1 gap-4 rounded-[12px] bg-page p-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">Typical grant</dt>
              <dd className="mt-1 text-body font-semibold text-plum">{detail ? (typical ?? "Not listed") : "Checking…"}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Open call</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-1.5 text-body text-plum">
                {row.isOpen ? (
                  <OpenCallBadge isOpen deadline={row.deadline} />
                ) : (
                  <span>
                    None found.{" "}
                    {website && (
                      <a href={website} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
                        Visit their website ↗
                      </a>
                    )}
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {!row.excludedReason && (
            <ActionButtons funderId={row.funderId} opportunityId={row.opportunityId} funderName={row.name} onResult={setMessage} className="mt-5" />
          )}
          <p role="status" aria-live="polite" className={message ? "mt-3 rounded-full bg-teal-tint px-4 py-2 text-body text-plum" : "sr-only"}>
            {message}
          </p>
        </section>

        {/* Deeper research: only four collapsible sections */}
        <div className="flex-1 border-t border-line px-6 pb-8 pt-2">
          <Section title="Funding focus and eligibility">
            <Bullets items={[...focusBullets, ...eligibilityBullets]} empty="We haven’t found details about their focus yet." />
          </Section>

          <Section title="Past giving and fit evidence">
            {detail && detail.topGrants.length > 0 ? (
              <ul className="divide-y divide-line rounded-[12px] border border-line">
                {detail.topGrants.slice(0, 5).map((g) => (
                  <li key={g.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">{softenCaps(g.recipientName)}</p>
                      <p className="text-sm text-muted">{[softenCaps(g.recipientCity), g.recipientState].filter(Boolean).join(", ")}</p>
                    </div>
                    <span className="whitespace-nowrap font-medium tabular-nums">{usd(g.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">{detail ? "No past grants on file." : "Loading…"}</p>
            )}
            <Bullets items={evidenceBullets} />
            <div>
              <p className="mb-2 font-medium">How the fit score adds up</p>
              <ul className="space-y-2.5">
                {COMPONENT_KEYS.map((k) => {
                  const c = row.components[k];
                  return (
                    <li key={k} className="flex items-center gap-3">
                      <span className="w-40 shrink-0 text-sm">{COMPONENT_LABELS[k]}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-plum-tint">
                        {c.score !== null && <span className="block h-full rounded-full bg-teal" style={{ width: `${c.score * 100}%` }} />}
                      </span>
                      <span className="w-16 text-right text-sm text-muted">{c.score === null ? "Unknown" : `${Math.round(c.score * 100)}%`}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-sm text-muted">This is a fit score, not the chance of winning. Missing information is left out, not counted as zero.</p>
            </div>
            {showPeople && detail && detail.people.length > 0 && (
              <div>
                <p className="mb-1 font-medium">Board and officers (from public filings)</p>
                <p className="text-body">{detail.people.map((p) => (p.title ? `${p.name} (${p.title})` : p.name)).join(", ")}</p>
                <p className="mt-1 text-sm text-muted">Names and titles only. We don’t collect contact details.</p>
              </div>
            )}
          </Section>

          <Section title="How to apply and required materials">
            {hasApplication ? (
              <>
                {openOpp && (
                  <Bullets
                    items={[
                      openOpp.route === "loi" ? "Start with a short letter of inquiry." : openOpp.route === "direct" ? "You can apply directly." : "",
                      `Deadline: ${openOpp.deadline ? shortDate(openOpp.deadline) : "rolling or not stated"}.`,
                    ].filter(Boolean)}
                  />
                )}
                {detail?.applicationInfo?.materials && (
                  <div>
                    <p className="mb-1 font-medium">What to prepare</p>
                    <Bullets items={toBullets(detail.applicationInfo.materials)} />
                  </div>
                )}
                {detail?.applicationInfo?.deadlines && (
                  <div>
                    <p className="mb-1 font-medium">Timing</p>
                    <Bullets items={toBullets(detail.applicationInfo.deadlines, 3)} />
                  </div>
                )}
                {detail?.applicationInfo?.restrictions && (
                  <div>
                    <p className="mb-1 font-medium">Good to know</p>
                    <Bullets items={toBullets(detail.applicationInfo.restrictions, 3)} />
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted">
                {detail ? "We haven’t found application instructions yet." : "Loading…"}{" "}
                {website && (
                  <a href={website} target="_blank" rel="noopener noreferrer" className="font-medium text-plum underline underline-offset-2">
                    Check their website ↗
                  </a>
                )}
              </p>
            )}
          </Section>

          <Section title="Sources">
            {sourceLinks.length > 0 ? (
              <ul className="space-y-2">
                {sourceLinks.map((s) => (
                  <li key={s.href}>
                    <SourceLink href={s.href}>{s.label}</SourceLink>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">No sources to show yet.</p>
            )}
            <p className="text-sm text-muted">Everything here comes from public information.</p>
          </Section>

          {showDraft && <OutreachPanel funderId={row.funderId} opportunityId={row.opportunityId} />}

          {!row.excludedReason && (
            <div className="mt-6 flex items-center gap-2 border-t border-line pt-5 text-sm text-muted">
              Doesn’t look right? <NotAFitButton funderId={row.funderId} opportunityId={row.opportunityId} funderName={row.name} onResult={setMessage} />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
