import { Fragment } from "react";
import { CalendarIcon, ClockIcon, CoinsIcon, DoorIcon } from "@/components/icons";
import { Pill, usd } from "@/components/ui";
import { actionCenter, CALENDAR_WINDOW_DAYS, daysUntil, hasSampleData, NOT_RECORDED, type ActionGroup, type ActionRow } from "@/lib/reports-model";
import { reportData } from "@/lib/reports-queries";
import { KpiCard, KpiGrid } from "./kpi-card";
import { Panel, SampleNote } from "./panel";

const GROUP_LABEL: Record<ActionGroup, string> = {
  overdue: "Past due",
  "this-week": "Due within 7 days",
  "next-30": "Due in 8–30 days",
  later: "Due later",
  "no-deadline": "Open calls with no deadline",
  payments: "Payment follow-ups",
};

/** Text, not color alone: urgent and overdue rows say so in words (rose pills). */
function DueCell({ row, today }: { row: ActionRow; today: string }) {
  if (!row.due) return <span className="text-muted">Not scheduled</span>;
  const d = daysUntil(row.due, today);
  return (
    <>
      <span className="font-medium tabular-nums text-plum">{row.due}</span>
      {row.overdueTag && <Pill tone="rose" className="ml-2">{row.overdueTag}</Pill>}
      {!row.overdueTag && row.group === "this-week" && (
        <Pill tone="rose" className="ml-2">
          {d === 0 ? "Due today" : `In ${d} ${d === 1 ? "day" : "days"}`}
        </Pill>
      )}
    </>
  );
}

export async function ActionCenter() {
  const { items, openCalls, today } = await reportData();
  const { rows, kpis } = actionCenter(items, openCalls, today);
  const sample = hasSampleData(items);

  return (
    <div className="space-y-6">
      <SampleNote show={sample} />

      <KpiGrid count={4}>
        <KpiCard label="Applications Due Soon" value={kpis.applicationsDueSoon} hint="application deadlines, next 30 days" icon={<CalendarIcon />} tone="rose" />
        <KpiCard label="Payments Pending" value={kpis.paymentsPendingCount} hint={`${usd(kpis.paymentsPendingBalance)} outstanding`} icon={<CoinsIcon />} tone="plum" />
        <KpiCard label="Open Calls Not Yet in Pipeline" value={kpis.openCallsNotInPipeline} hint="open, with no pipeline item" icon={<DoorIcon />} tone="teal" />
        <KpiCard label="Awarded Funding Still Outstanding" value={kpis.awardedOutstanding === null ? NOT_RECORDED : usd(kpis.awardedOutstanding)} hint="balance left on awards" icon={<ClockIcon />} tone="teal" />
      </KpiGrid>

      {kpis.awardedMissingAmount > 0 && (
        <p role="note" className="text-xs text-muted">
          {kpis.awardedMissingAmount} awarded {kpis.awardedMissingAmount === 1 ? "item has" : "items have"} no award amount recorded, so {kpis.awardedMissingAmount === 1 ? "its" : "their"} balance isn&apos;t counted here.
        </p>
      )}

      <Panel title="What needs action" subtitle="Application deadlines, open calls to review, and awards that still owe money. Each item appears once." sample={sample}>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Nothing needs action right now. Deadlines and open calls will appear here when they are in your pipeline or open to apply.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[58rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1.5 pr-3">Due Date</th>
                  <th className="pr-3">Funder</th>
                  <th className="pr-3">Action Needed</th>
                  <th className="pr-3">Funding Amount</th>
                  <th className="pr-3">Application Route</th>
                  <th className="pr-3">Status</th>
                  <th className="pr-3">Next Action</th>
                  <th className="sr-only">Calendar</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <Fragment key={`${r.kind}-${r.funderName}-${i}`}>
                    {(i === 0 || rows[i - 1].group !== r.group) && (
                      <tr>
                        <th colSpan={8} scope="colgroup" className="bg-plum-tint px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-plum">
                          {GROUP_LABEL[r.group]}
                        </th>
                      </tr>
                    )}
                    <tr className="border-b border-line align-top">
                      <td className="py-2 pr-3">
                        <DueCell row={r} today={today} />
                      </td>
                      <td className="pr-3 font-medium">
                        {r.funderName}
                        {r.isSample && <Pill className="ml-2">SAMPLE</Pill>}
                        {r.detail && <span className="block text-xs font-normal text-muted">{r.detail}</span>}
                      </td>
                      <td className="pr-3">{r.action}</td>
                      <td className="pr-3 tabular-nums">{r.amountText}</td>
                      <td className="pr-3">{r.route}</td>
                      <td className="pr-3">
                        <Pill tone={r.status === "Open Call" ? "teal" : "plum"}>{r.status}</Pill>
                      </td>
                      <td className="pr-3 text-muted">{r.nextAction}</td>
                      <td className="text-right">
                        {r.calendarKey && (
                          <a className="text-xs font-medium text-plum underline underline-offset-2" href={`/api/calendar/${r.calendarKey}`} aria-label={`Add to calendar: ${r.action} for ${r.funderName}`}>
                            Add to calendar
                          </a>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">“Add to calendar” is offered for deadlines in the next {CALENDAR_WINDOW_DAYS} days. Payment follow-ups have no date because payment timing is not tracked.</p>
      </Panel>
    </div>
  );
}
