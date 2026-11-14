import type { ReactNode } from "react";

const CHIP = { plum: "bg-plum-tint", teal: "bg-teal-tint", rose: "bg-rose-tint" } as const;

/** KPI tile: icon chip top-left, small label top-right, large figure, caption. */
export function KpiTile({ icon, label, value, caption, tone }: { icon: ReactNode; label: string; value: string; caption: string; tone: keyof typeof CHIP }) {
  return (
    <div className="rounded-[16px] border border-line bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-full text-plum ${CHIP[tone]}`}>{icon}</span>
        <span className="text-meta font-medium text-muted">{label}</span>
      </div>
      <p className="mt-4 text-title font-semibold tabular-nums text-plum">{value}</p>
      <p className="mt-1 text-meta text-muted">{caption}</p>
    </div>
  );
}
