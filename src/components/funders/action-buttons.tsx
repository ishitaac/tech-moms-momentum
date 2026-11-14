"use client";

import { useState, useTransition, type ReactNode } from "react";
import { decide, unsaveFunder } from "@/app/actions";
import { BTN, Pill } from "@/components/ui";

/** Same three saved decisions as before; only the wording changed (approve / snooze / reject). */
export type DecisionAction = "approve" | "snooze" | "reject";

const DONE: Record<DecisionAction, string> = {
  approve: "Added to your pipeline.",
  snooze: "Saved for later. Find it on the Saved for Later page.",
  reject: "Marked as not a fit. We'll hide it unless something changes.",
};
const REMOVED = "Removed from Saved for Later.";

function useDecision(funderId: number, opportunityId: number | null, funderName: string, onResult: (message: string) => void) {
  const [pending, startTransition] = useTransition();
  const act = (action: DecisionAction, onDone?: () => void) =>
    startTransition(async () => {
      const r = await decide({ funderId, opportunityId, action });
      if (r.ok) onDone?.();
      onResult(r.ok ? `${funderName}: ${DONE[action]}` : r.error);
    });
  const unsave = (onDone?: () => void) =>
    startTransition(async () => {
      const r = await unsaveFunder(funderId);
      if (r.ok) onDone?.();
      onResult(r.ok ? `${funderName}: ${REMOVED}` : r.error);
    });
  return { pending, act, unsave };
}

interface Props {
  funderId: number;
  opportunityId: number | null;
  funderName: string;
  onResult: (message: string) => void;
  className?: string;
  /** The funder is currently saved: show a "Saved" tag and "Remove from saved" instead of "Save for later". */
  saved?: boolean;
  /** Already in the pipeline: "Save for later" is hidden (it only makes sense before adding). */
  inPipeline?: boolean;
  /** Hide the "Saved" tag where the page itself already says so (the Saved for Later page). */
  hideSavedTag?: boolean;
  /** Extra quiet content placed after the buttons (e.g. a "View details" link). */
  children?: ReactNode;
}

/** Primary: Add to pipeline. Secondary: Save for later, or Remove from saved when it is already saved. */
export function ActionButtons({ funderId, opportunityId, funderName, onResult, className = "", saved: initialSaved = false, inPipeline = false, hideSavedTag = false, children }: Props) {
  const { pending, act, unsave } = useDecision(funderId, opportunityId, funderName, onResult);
  // Local state so the buttons update right away; the server data refreshes behind it.
  const [saved, setSaved] = useState(initialSaved);
  const [added, setAdded] = useState(false);

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {saved && !hideSavedTag && <Pill tone="teal">Saved</Pill>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          act("approve", () => {
            setAdded(true);
            setSaved(false); // adding to the pipeline replaces the saved state
          })
        }
        className={BTN.primary}
        aria-label={`Add ${funderName} to pipeline`}
      >
        Add to pipeline
      </button>
      {saved ? (
        <button type="button" disabled={pending} onClick={() => unsave(() => setSaved(false))} className={BTN.secondary} aria-label={`Remove ${funderName} from saved`}>
          Remove from saved
        </button>
      ) : (
        !inPipeline &&
        !added && (
          <button type="button" disabled={pending} onClick={() => act("snooze", () => setSaved(true))} className={BTN.secondary} aria-label={`Save ${funderName} for later`}>
            Save for later
          </button>
        )
      )}
      {children}
    </div>
  );
}

/** Quiet text action, shown only inside the details panel. */
export function NotAFitButton({ funderId, opportunityId, funderName, onResult }: Omit<Props, "className" | "children" | "saved" | "inPipeline" | "hideSavedTag">) {
  const { pending, act } = useDecision(funderId, opportunityId, funderName, onResult);
  return (
    <button type="button" disabled={pending} onClick={() => act("reject")} className="text-sm text-muted underline decoration-muted/40 underline-offset-4 hover:text-plum disabled:opacity-60">
      Not a fit for us
    </button>
  );
}
