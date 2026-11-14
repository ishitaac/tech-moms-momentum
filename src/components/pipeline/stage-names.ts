import type { Stage } from "@/lib/pipeline-model";

/** Plain-English stage names for display (stored stage values are unchanged). */
export const STAGE_NAME: Record<Stage, string> = {
  prospect: "Prospect",
  loi: "Letter of Intent",
  submitted: "Submitted",
  awarded: "Awarded",
  declined: "Declined",
};

/** A gentle hint shown on a card when it has no deadline. */
export const NEXT_ACTION: Record<Stage, string | null> = {
  prospect: "Next: decide whether to apply",
  loi: "Next: send your letter of intent",
  submitted: "Next: wait for their decision",
  awarded: "Next: record payments as they arrive",
  declined: null,
};
