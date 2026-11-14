"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionButtons } from "@/components/funders/action-buttons";
import { FunderDrawer } from "@/components/funders/funder-drawer";
import { BandBadge, CARD, OpenCallBadge, Pill, ScoreBadge, softenCaps, typeLabel } from "@/components/ui";
import type { ListRow } from "@/lib/queries";
import { isHiddenFromList, longDate, type SavedRow } from "@/lib/saved-model";

interface Props {
  rows: SavedRow[];
  today: string;
  showPeople: boolean;
  showDraft: boolean;
}

const LINK = "text-sm font-medium text-plum underline decoration-plum/40 underline-offset-4 hover:decoration-plum";

/** Saved funders as cards, in the same style as the Funders list. */
export function SavedTable({ rows, today, showPeople, showDraft }: Props) {
  const [selected, setSelected] = useState<ListRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (rows.length === 0 && !notice) {
    return (
      <div className={`${CARD} border-dashed p-10 text-center text-body text-muted`}>
        <p className="font-medium text-plum">Nothing saved yet.</p>
        <p className="mt-1">
          Choose “Save for later” on a funder and it will show up here. Start from the{" "}
          <Link href="/" className="text-plum underline underline-offset-2">
            Funders list
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <>
      <p role="status" aria-live="polite" className={notice ? "rounded-full bg-teal-tint px-5 py-2.5 text-body text-plum" : "sr-only"}>
        {notice}
      </p>
      {rows.length === 0 && (
        <div className={`${CARD} mt-4 border-dashed p-10 text-center text-body text-muted`}>
          <p className="font-medium text-plum">Nothing saved right now.</p>
          <p className="mt-1">
            Find more on the{" "}
            <Link href="/" className="text-plum underline underline-offset-2">
              Funders list
            </Link>
            .
          </p>
        </div>
      )}
      <ul className="space-y-4">
        {rows.map(({ row: r, savedOn, snoozeUntil, scored, inPipeline }) => {
          const hidden = isHiddenFromList(snoozeUntil, today);
          return (
            <li key={r.funderId} className={`${CARD} p-5 sm:p-6 ${selected?.funderId === r.funderId ? "ring-2 ring-plum" : ""}`}>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:gap-2">
                  <ScoreBadge total={r.total} band={r.band} />
                  {scored ? <BandBadge band={r.band} /> : <span className="text-xs text-muted">No fit score yet</span>}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-[17px] font-semibold leading-snug text-plum">{r.name}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Pill tone="plum">{typeLabel(r.type)}</Pill>
                    {r.state && <Pill>{r.state === "UT" ? "Utah" : "National"}</Pill>}
                    <OpenCallBadge isOpen={r.isOpen} deadline={r.deadline} />
                    {inPipeline && <Pill tone="teal">In your pipeline</Pill>}
                  </div>

                  <p className="mt-4 text-body leading-relaxed text-plum">
                    {r.excludedReason ? (
                      <>
                        <span className="font-semibold">Why it’s hidden: </span>
                        <span className="line-clamp-2">{softenCaps(r.excludedReason)}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold">Why it matches: </span>
                        <span className="line-clamp-2">{scored && r.reason ? softenCaps(r.reason) : "No fit score yet."}</span>
                      </>
                    )}
                  </p>

                  <p className="mt-3 text-sm text-muted">
                    Saved {longDate(savedOn)}
                    {hidden && snoozeUntil ? ` · Hidden from your Funders list until ${longDate(snoozeUntil)}` : ""}
                  </p>

                  <div className="mt-4">
                    <ActionButtons
                      key={r.funderId}
                      funderId={r.funderId}
                      opportunityId={r.opportunityId}
                      funderName={r.name}
                      onResult={setNotice}
                      saved
                      hideSavedTag
                    >
                      <button type="button" onClick={() => setSelected(r)} className={LINK} aria-label={`View details for ${r.name}`}>
                        View details
                      </button>
                    </ActionButtons>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {selected && <FunderDrawer key={selected.funderId} row={selected} onClose={() => setSelected(null)} showPeople={showPeople} showDraft={showDraft} />}
    </>
  );
}
