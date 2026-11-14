import Link from "next/link";
import { REPORTING_TABS, type ReportingTab } from "@/lib/reporting-model";

/** Sub-tabs for Reporting. The selected tab lives in the URL (?tab=...) so it can be linked and survives a refresh. */
export function ReportingTabs({ active }: { active: ReportingTab }) {
  return (
    <nav aria-label="Reporting sections" className="mb-6 flex flex-wrap gap-2">
      {REPORTING_TABS.map((t) => {
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
