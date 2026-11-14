import { addDays, formatDistanceToNow } from "date-fns";
import { allFlags } from "@/config/flags";
import { filterRows, parseFilters, type Filters as FilterState } from "@/lib/list-filters";
import { pipelineCards, stageTotal, upcomingDeadlines } from "@/lib/pipeline-queries";
import { rankedRows } from "@/lib/queries";
import { CalendarIcon, CoinsIcon, DoorIcon, SparkleIcon } from "@/components/icons";
import { CARD, StatCard, usd } from "@/components/ui";
import { Filters } from "./filters";
import { FunderTable } from "./funder-table";
import { TrustBanner } from "./trust-banner";

const MAX_ROWS = 300;
const DEADLINE_SOON_DAYS = 14;

export async function FunderList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const [{ rows, refresh }, cards, deadlines] = await Promise.all([rankedRows(), pipelineCards(), upcomingDeadlines()]);
  const today = new Date().toISOString().slice(0, 10);
  // Location is a display filter applied here, so the shared filter logic stays as it was.
  const locParam = Array.isArray(params.loc) ? params.loc[0] : params.loc;
  const location = locParam === "utah" || locParam === "national" ? locParam : null;
  const matchesLocation = (r: { state: string | null }) => !location || (location === "utah") === (r.state === "UT");
  const visible = filterRows(rows, filters, today).filter(matchesLocation);
  const active = rows.filter((r) => !r.excludedReason);
  // Summary numbers describe the default "top matches" list, before any filters.
  const topMatches = filterRows(rows, { view: "shortlist", type: null, band: null, openOnly: false, q: "" } satisfies FilterState, today);
  const strongCount = topMatches.filter((r) => r.band === "Strong").length;
  const openCalls = topMatches.filter((r) => r.isOpen).length;
  const soonCutoff = addDays(new Date(), DEADLINE_SOON_DAYS).toISOString().slice(0, 10);
  const dueSoon = deadlines.filter((d) => d.deadline <= soonCutoff).length;
  const pipelineTotal = (["prospect", "loi", "submitted"] as const).reduce((s, st) => s + stageTotal(cards, st), 0);
  const excludedCount = rows.length - active.length;
  const focusFunder = Number(Array.isArray(params.funder) ? params.funder[0] : params.funder) || null;

  if (!refresh) {
    return (
      <div className={`${CARD} border-dashed p-10 text-center text-muted`}>
        No ranked list yet. Run the first refresh from <a className="text-plum underline" href="/settings">Settings</a>.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TrustBanner />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Strong matches" value={strongCount} hint="best alignment with our mission" icon={<SparkleIcon />} tone="teal" />
        <StatCard label="Open opportunities" value={openCalls} hint="accepting applications now" icon={<DoorIcon />} tone="teal" />
        <StatCard label="Deadlines soon" value={dueSoon} hint={`in the next ${DEADLINE_SOON_DAYS} days`} icon={<CalendarIcon />} tone="rose" />
        <StatCard label="Active pipeline value" value={usd(pipelineTotal)} hint="requested, still in progress" icon={<CoinsIcon />} tone="plum" />
      </div>

      <Filters filters={filters} location={location} excludedCount={excludedCount} updated={formatDistanceToNow(refresh.startedAt, { addSuffix: true })} />
      <FunderTable
        rows={visible.slice(0, MAX_ROWS)}
        totalMatching={visible.length}
        isExcludedView={filters.view === "excluded"}
        showPeople={allFlags().boardMembers}
        showDraft={allFlags().aiDraft}
        focusFunderId={focusFunder}
      />
    </div>
  );
}
