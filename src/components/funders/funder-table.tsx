"use client";

import { useState } from "react";
import type { ListRow } from "@/lib/queries";
import { BandBadge, CARD, OpenCallBadge, Pill, ScoreBadge, softenCaps, typeLabel } from "@/components/ui";
import { ActionButtons } from "./action-buttons";
import { FunderDrawer } from "./funder-drawer";

interface Props {
  rows: ListRow[];
  totalMatching: number;
  isExcludedView: boolean;
  showPeople: boolean;
  showDraft: boolean;
  focusFunderId: number | null;
}

/** Funder results as concise cards (file name kept; it is no longer a table). */
export function FunderTable({ rows, totalMatching, isExcludedView, showPeople, showDraft, focusFunderId }: Props) {
  const [selected, setSelected] = useState<ListRow | null>(() => rows.find((r) => r.funderId === focusFunderId) ?? null);
  const [notice, setNotice] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className={`${CARD} border-dashed p-10 text-center text-body text-muted`}>
        No funders match these filters. Try clearing a filter or searching for a different name.
      </div>
    );
  }

  return (
    <>
      <p role="status" aria-live="polite" className={notice ? "rounded-full bg-teal-tint px-5 py-2.5 text-body text-plum" : "sr-only"}>
        {notice}
      </p>
      <ul className="space-y-4">
        {rows.map((r) => {
          const isSelected = selected?.scoreId === r.scoreId;
          const inPipeline = r.decision === "approve";
          const pastFunder = r.reason?.includes("Has funded Tech-Moms");
          return (
            <li key={r.scoreId} className={`${CARD} p-5 sm:p-6 ${isSelected ? "ring-2 ring-plum" : ""}`}>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:gap-2">
                  <ScoreBadge total={r.total} band={r.band} />
                  <BandBadge band={r.band} />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-[17px] font-semibold leading-snug text-plum">{r.name}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Pill tone="plum">{typeLabel(r.type)}</Pill>
                    <Pill>{r.state === "UT" ? "Utah" : "National"}</Pill>
                    <OpenCallBadge isOpen={r.isOpen} deadline={r.deadline} />
                    {pastFunder && <Pill tone="teal">Past funder</Pill>}
                    {r.isNew && <Pill tone="rose">New</Pill>}
                  </div>

                  <p className="mt-4 text-body leading-relaxed text-plum">
                    <span className="font-semibold">{isExcludedView ? "Why it’s hidden: " : "Why it matches: "}</span>
                    <span className="line-clamp-2">{softenCaps(isExcludedView ? r.excludedReason : r.reason)}</span>
                  </p>

                  <div className="mt-5">
                    {isExcludedView ? (
                      <button type="button" onClick={() => setSelected(r)} className="text-sm font-medium text-plum underline decoration-plum/40 underline-offset-4 hover:decoration-plum">
                        View details
                      </button>
                    ) : inPipeline ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <Pill tone="teal">In your pipeline</Pill>
                        <button type="button" onClick={() => setSelected(r)} className="text-sm font-medium text-plum underline decoration-plum/40 underline-offset-4 hover:decoration-plum" aria-label={`View details for ${r.name}`}>
                          View details
                        </button>
                      </div>
                    ) : (
                      <ActionButtons
                        key={`${r.scoreId}-${r.decision}`}
                        funderId={r.funderId}
                        opportunityId={r.opportunityId}
                        funderName={r.name}
                        onResult={setNotice}
                        saved={r.decision === "snooze"}
                      >
                        <button type="button" onClick={() => setSelected(r)} className="text-sm font-medium text-plum underline decoration-plum/40 underline-offset-4 hover:decoration-plum" aria-label={`View details for ${r.name}`}>
                          View details
                        </button>
                      </ActionButtons>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {totalMatching > rows.length && (
        <p className="text-center text-sm text-muted">
          Showing the top {rows.length} of {totalMatching.toLocaleString()}. Use the filters or search to narrow it down.
        </p>
      )}
      {selected && (
        <FunderDrawer key={selected.scoreId} row={selected} onClose={() => setSelected(null)} showPeople={showPeople} showDraft={showDraft} />
      )}
    </>
  );
}
