"use client";

import { useTransition, type ReactNode } from "react";
import { decide } from "@/app/actions";
import { BTN } from "@/components/ui";

/** Same three saved decisions as before; only the wording changed (approve / snooze / reject). */
export type DecisionAction = "approve" | "snooze" | "reject";

const DONE: Record<DecisionAction, string> = {
  approve: "Added to your pipeline.",
  snooze: "Saved for later. It will come back to your list.",
  reject: "Marked as not a fit. We'll hide it unless something changes.",
};

function useDecision(funderId: number, opportunityId: number | null, funderName: string, onResult: (message: string) => void) {
  const [pending, startTransition] = useTransition();
  const act = (action: DecisionAction) =>
    startTransition(async () => {
      const r = await decide({ funderId, opportunityId, action });
      onResult(r.ok ? `${funderName}: ${DONE[action]}` : r.error);
    });
  return { pending, act };
}

interface Props {
  funderId: number;
  opportunityId: number | null;
  funderName: string;
  onResult: (message: string) => void;
  className?: string;
  /** Extra quiet content placed after the two buttons (e.g. a "View details" link). */
  children?: ReactNode;
}

/** Primary: Add to pipeline. Secondary: Save for later. */
export function ActionButtons({ funderId, opportunityId, funderName, onResult, className = "", children }: Props) {
  const { pending, act } = useDecision(funderId, opportunityId, funderName, onResult);
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <button type="button" disabled={pending} onClick={() => act("approve")} className={BTN.primary} aria-label={`Add ${funderName} to pipeline`}>
        Add to pipeline
      </button>
      <button type="button" disabled={pending} onClick={() => act("snooze")} className={BTN.secondary} aria-label={`Save ${funderName} for later`}>
        Save for later
      </button>
      {children}
    </div>
  );
}

/** Quiet text action, shown only inside the details panel. */
export function NotAFitButton({ funderId, opportunityId, funderName, onResult }: Omit<Props, "className" | "children">) {
  const { pending, act } = useDecision(funderId, opportunityId, funderName, onResult);
  return (
    <button type="button" disabled={pending} onClick={() => act("reject")} className="text-sm text-muted underline decoration-muted/40 underline-offset-4 hover:text-plum disabled:opacity-60">
      Not a fit for us
    </button>
  );
}
