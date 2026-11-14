import type { ReactNode } from "react";
import { InfoIcon } from "@/components/icons";
import { CARD } from "@/components/ui";
import { NOT_RECORDED } from "@/lib/reports-model";

type Tone = "plum" | "teal" | "rose";
const TONE_BG: Record<Tone, string> = { plum: "bg-plum-tint", teal: "bg-teal-tint", rose: "bg-rose-tint" };

const NOT_RECORDED_TIP = "No amount has been entered for this item";

/**
 * KPI card for the Reports tabs. Stacked layout so nothing is squeezed beside the icon:
 * icon in a small circle, then the label (up to two lines, space reserved so every value starts at the
 * same height), then the value, then the note. Same text, icons and numbers as before; same color tokens.
 *
 * Dollar values and counts never wrap. Text values (such as "Not recorded") are smaller, muted and may wrap,
 * so they don't read as data. The value size is a clamp() driven by the card's own width, so a long
 * dollar amount shrinks instead of overflowing.
 */
export function KpiCard({ label, value, hint, icon, tone = "plum" }: { label: string; value: ReactNode; hint?: ReactNode; icon: ReactNode; tone?: Tone }) {
  const isText = typeof value === "string" && /[A-Za-z]/.test(value);
  const isNotRecorded = value === NOT_RECORDED;

  return (
    <div className={`${CARD} @container flex h-full min-w-0 flex-col p-5`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-plum ${TONE_BG[tone]}`}>{icon}</span>
      <p className="mt-3 min-h-10 text-sm leading-5 text-muted">{label}</p>
      <div className="mt-1 flex min-h-10 items-center">
        {isText ? (
          <span className="text-[1.1rem] font-normal leading-6 text-muted [overflow-wrap:anywhere]" title={isNotRecorded ? NOT_RECORDED_TIP : undefined}>
            {value}
            {isNotRecorded && (
              <>
                <InfoIcon className="ml-1.5 inline-block h-4 w-4 align-[-0.15em]" />
                <span className="sr-only">. {NOT_RECORDED_TIP}</span>
              </>
            )}
          </span>
        ) : (
          <span className="whitespace-nowrap font-semibold leading-tight tabular-nums text-plum" style={{ fontSize: "clamp(1.5rem, 0.9rem + 8cqw, 2rem)" }}>
            {value}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs leading-4 text-muted">{hint}</p>}
    </div>
  );
}

/** Equal-height card grid: 1 column on phones, 2 on small, 3 on medium, 5 (or 4) on wide screens. Never scrolls sideways. */
export function KpiGrid({ count, children }: { count: 4 | 5; children: ReactNode }) {
  const wide = count === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4";
  // Four cards stay 2 x 2 on medium screens; a 3-column row would leave one card alone.
  const medium = count === 5 ? "md:grid-cols-3" : "md:grid-cols-2";
  return <div className={`grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 ${medium} ${wide}`}>{children}</div>;
}
