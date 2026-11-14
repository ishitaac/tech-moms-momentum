import { SingleBars } from "@/components/dashboard/charts";
import { CalendarIcon, CheckIcon, ClockIcon, CoinsIcon, PipelineIcon } from "@/components/icons";
import { Pill, StatCard, typeLabel, usd } from "@/components/ui";
import { isEnabled } from "@/config/flags";
import { distinctByMonth, fundingMix, giftRanges, winRateByType } from "@/lib/dashboard-model";
import { paymentRows, pipelineCards, upcomingDeadlines } from "@/lib/pipeline-queries";
import { applicationsDueSoon, awardedVsReceivedByMonth, collectionTracker, DUE_SOON_DAYS, fundingKpis, hasSampleData, money, NOT_RECORDED, pipelineGlance } from "@/lib/reports-model";
import { reportData } from "@/lib/reports-queries";
import { Panel, SampleNote } from "./panel";
import { FundingMovementChart, PipelineGlanceChart } from "./report-charts";

/** Missing amounts read "Not recorded", never $0. */
const kpiMoney = (n: number | null) => (n === null ? NOT_RECORDED : usd(n));

export async function FundingHealth() {
  const full = isEnabled("fullDashboard");
  const [data, deadlines, extras] = await Promise.all([reportData(), upcomingDeadlines(), full ? Promise.all([pipelineCards(), paymentRows()]) : null]);
  const { items, payments, openCalls, today } = data;

  const kpis = fundingKpis(items);
  const movement = awardedVsReceivedByMonth(items, payments);
  const tracker = collectionTracker(items);
  const sample = hasSampleData(items);
  const q = kpis.quality;
  const checks: string[] = [];
  if (q.overpaid.length) {
    checks.push(
      `${q.overpaid.length} ${q.overpaid.length === 1 ? "award has" : "awards have"} more cash recorded than the award amount (${q.overpaid.map((o) => `${o.funderName} by ${money(o.over)}`).join("; ")}). Still to Receive counts ${q.overpaid.length === 1 ? "it" : "them"} as fully received, not as a negative.`,
    );
  }
  if (q.awardedMissingAmount) checks.push(`${q.awardedMissingAmount} awarded ${q.awardedMissingAmount === 1 ? "item has" : "items have"} no award amount recorded, so ${q.awardedMissingAmount === 1 ? "it isn't" : "they aren't"} in the dollar totals.`);
  if (q.activeMissingAsk) checks.push(`${q.activeMissingAsk} LOI or Submitted ${q.activeMissingAsk === 1 ? "item has" : "items have"} no amount asked recorded.`);

  return (
    <div className="space-y-6">
      <SampleNote show={sample} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Committed / Awarded Funding" value={kpiMoney(kpis.committed)} hint="amount awarded, Awarded stage" icon={<CheckIcon />} tone="teal" />
        <StatCard label="Cash Received" value={usd(kpis.cashReceived)} hint="payments on awarded items" icon={<CoinsIcon />} tone="rose" />
        <StatCard label="Still to Receive" value={kpiMoney(kpis.stillToReceive)} hint="balance left on each award" icon={<ClockIcon />} tone="plum" />
        <StatCard label="Active Funding Requests" value={kpiMoney(kpis.activeRequests)} hint="asked, in LOI and Submitted" icon={<PipelineIcon />} tone="teal" />
        <StatCard label="Applications Due Soon" value={applicationsDueSoon(items, openCalls, today)} hint={`application deadlines, next ${DUE_SOON_DAYS} days`} icon={<CalendarIcon />} tone="rose" />
      </div>

      {checks.length > 0 && (
        <div role="note" className="rounded-[16px] border border-line bg-card p-4 text-sm text-plum">
          <p className="font-medium">Data check</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
            {checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Funding Movement" subtitle="Awards by award month, cash by month received" sample={sample}>
          <FundingMovementChart data={movement.rows} />
          {movement.awardedWithoutDate > 0 && (
            <p className="mt-2 text-xs text-muted">
              {movement.awardedWithoutDate} awarded {movement.awardedWithoutDate === 1 ? "item has" : "items have"} no award date, so {movement.awardedWithoutDate === 1 ? "it isn't" : "they aren't"} in the monthly Awarded bars.
            </p>
          )}
        </Panel>
        <Panel title="Pipeline at a Glance" subtitle="Dollars in each stage, with the number of items" sample={sample}>
          <PipelineGlanceChart data={pipelineGlance(items)} />
        </Panel>
      </div>

      <Panel title="Cash Collection Tracker" subtitle="Each award, what has arrived, and what is still owed. Largest balance first." sample={sample}>
        {tracker.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No awarded funding recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1.5 pr-3">Funder</th>
                  <th className="pr-3">Awarded</th>
                  <th className="pr-3">Received</th>
                  <th className="pr-3">Still to Receive</th>
                  <th className="pr-3">Percent Received</th>
                  <th>Next Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tracker.map((r) => (
                  <tr key={r.itemId}>
                    <td className="py-2 pr-3 font-medium">
                      {r.funderName}
                      {r.isSample && <Pill className="ml-2">SAMPLE</Pill>}
                      {r.overpaidBy > 0 && <Pill className="ml-2">Overpaid by {money(r.overpaidBy)}</Pill>}
                    </td>
                    <td className="pr-3 tabular-nums">{r.awarded === null ? NOT_RECORDED : usd(r.awarded)}</td>
                    <td className="pr-3 tabular-nums">{usd(r.received)}</td>
                    <td className="pr-3 tabular-nums">{r.stillToReceive === null ? NOT_RECORDED : usd(r.stillToReceive)}</td>
                    <td className="pr-3 tabular-nums">{r.percentReceived === null ? "—" : `${Math.round(r.percentReceived * 100)}%`}</td>
                    <td className="text-muted">{r.nextAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Upcoming deadlines" subtitle="Applications in your pipeline and open calls due in the next 60 days">
        {deadlines.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Nothing due in the next 60 days.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr><th className="py-1.5">Due</th><th>Funder</th><th>What</th><th>Type</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {deadlines.map((d) => (
                <tr key={d.key}>
                  <td className="py-2 font-medium tabular-nums text-plum">{d.deadline}</td>
                  <td className="font-medium">{d.funderName}</td>
                  <td className="text-muted">{d.title}</td>
                  <td className="text-xs text-muted">{d.kind}</td>
                  <td className="text-right">
                    <a className="text-xs font-medium text-plum underline underline-offset-2" href={`/api/calendar/${d.key}`}>Add to calendar</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {extras && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Funding mix" subtitle="Received dollars by funder type">
            <SingleBars valueLabel="Received" data={fundingMix(extras[1]).map((m) => ({ label: typeLabel(m.type), value: m.amount }))} />
          </Panel>
          <Panel title="Gift ranges" subtitle="Number of payments in each size band">
            <SingleBars isMoney={false} valueLabel="Gifts" data={giftRanges(extras[1]).map((g) => ({ label: g.label, value: g.count }))} />
          </Panel>
          <Panel title="Win rate by funder type" subtitle="Awarded ÷ (awarded + declined)">
            <SingleBars isMoney={false} valueLabel="Win rate %" data={winRateByType(extras[0]).map((w) => ({ label: typeLabel(w.type), value: Math.round(w.rate * 100) }))} />
          </Panel>
          <Panel title="Distinct gifts and funders" subtitle="Per month; funders reported as organizations only">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted"><tr><th className="py-1.5">Month</th><th>Gifts</th><th>Funders</th></tr></thead>
              <tbody className="divide-y divide-line">
                {distinctByMonth(extras[1]).map((r) => <tr key={r.month}><td className="py-1.5">{r.month}</td><td className="tabular-nums">{r.gifts}</td><td className="tabular-nums">{r.funders}</td></tr>)}
              </tbody>
            </table>
          </Panel>
        </div>
      )}
    </div>
  );
}
