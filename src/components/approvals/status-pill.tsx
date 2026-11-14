import { Pill } from "@/components/ui";
import { STATUS_LABELS, type ApprovalStatus } from "@/lib/approvals/model";

const TONE: Record<ApprovalStatus, "plum" | "teal" | "rose" | "neutral"> = {
  draft: "neutral",
  pending_approval: "rose",
  approved: "teal",
  changes_requested: "plum",
  rejected: "neutral",
};

const MARK: Record<ApprovalStatus, string> = {
  draft: "○",
  pending_approval: "◷",
  approved: "✓",
  changes_requested: "↺",
  rejected: "✕",
};

/** Status always shown as text plus a symbol, never color alone. */
export function StatusPill({ status }: { status: ApprovalStatus }) {
  return (
    <Pill tone={TONE[status]} icon={<span aria-hidden="true">{MARK[status]}</span>}>
      {STATUS_LABELS[status]}
    </Pill>
  );
}
