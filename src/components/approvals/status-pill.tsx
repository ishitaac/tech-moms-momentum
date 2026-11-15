import { Pill } from "@/components/ui";
import { STATUS_LABEL, type ReviewStatus } from "@/lib/approvals/model";

const TONE: Record<ReviewStatus, "plum" | "teal" | "rose" | "neutral"> = {
  draft: "neutral",
  pending_approval: "plum",
  approved: "teal",
  changes_requested: "rose",
  rejected: "rose",
};
const MARK: Record<ReviewStatus, string> = { draft: "○", pending_approval: "◐", approved: "✓", changes_requested: "↺", rejected: "✕" };

/** Text label always present; the symbol and color only reinforce it. */
export function ReviewStatusPill({ status }: { status: ReviewStatus | null }) {
  if (!status) return <Pill tone="neutral">Not submitted</Pill>;
  return (
    <Pill tone={TONE[status]} icon={<span aria-hidden="true">{MARK[status]}</span>}>
      {STATUS_LABEL[status]}
    </Pill>
  );
}
