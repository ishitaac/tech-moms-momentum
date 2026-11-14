import Link from "next/link";
import { REPORT_TABS, type ReportTab } from "@/lib/reports-model";

/** Sub-tabs for Reports, styled like the existing pills. The selected tab lives in the URL (?tab=...). */
export function ReportTabs({ active }: { active: ReportTab }) {
  return (
    <nav aria-label="Report sections" className="mb-6 flex flex-wrap gap-2">
      {REPORT_TABS.map((t) => {
        const on = t.id === active;
        return (
          <Link
            key={t.id}
            href={`/dashboard?tab=${t.id}`}
            aria-current={on ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${on ? "bg-plum text-white" : "border border-line bg-card text-plum hover:bg-plum-tint"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
