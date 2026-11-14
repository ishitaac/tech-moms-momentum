import { Pill, usd } from "@/components/ui";
import { hasSampleData, MIN_DECIDED, NOT_RECORDED, strategyRows } from "@/lib/reports-model";
import { reportData } from "@/lib/reports-queries";
import { Panel, SampleNote } from "./panel";
import { WinRateChart } from "./report-charts";

export async function FunderStrategy() {
  const { items } = await reportData();
  const rows = strategyRows(items);
  const sample = hasSampleData(items);

  return (
    <div className="space-y-6">
      <SampleNote show={sample} />

      <p role="note" className="rounded-[16px] border border-line bg-card p-4 text-sm text-muted">
        <span className="font-medium text-plum">Performance reflects current pipeline records. Historical stage changes are not tracked.</span> “Active / Submitted Applications” counts items
        currently in Submitted, Awarded or Declined, not every application ever sent. Win rate uses decided opportunities only (Awarded or Declined).
      </p>

      <Panel title="Where to spend your time" subtitle="By funder type. Recommended actions come from fixed rules, not AI." sample={sample}>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No pipeline items yet. Add funders to your pipeline and record outcomes to see how each funder type performs.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1.5 pr-3">Funder Type</th>
                  <th className="pr-3">Active / Submitted Applications</th>
                  <th className="pr-3">Awards</th>
                  <th className="pr-3">Decided Opportunities</th>
                  <th className="pr-3">Win Rate</th>
                  <th className="pr-3">Amount Received</th>
                  <th className="pr-3">Average Award</th>
                  <th>Recommended Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.type} className="align-top">
                    <td className="py-2 pr-3 font-medium">
                      {r.label}
                      {r.hasSample && <Pill className="ml-2">SAMPLE</Pill>}
                    </td>
                    <td className="pr-3 tabular-nums">{r.submitted}</td>
                    <td className="pr-3 tabular-nums">{r.awards}</td>
                    <td className="pr-3 tabular-nums">{r.decided}</td>
                    <td className="pr-3 tabular-nums">{r.winRate === null ? <span className="text-muted">Not enough data</span> : `${Math.round(r.winRate * 100)}%`}</td>
                    <td className="pr-3 tabular-nums">{usd(r.amountReceived)}</td>
                    <td className="pr-3 tabular-nums">{r.awards === 0 ? "—" : r.averageAward === null ? NOT_RECORDED : usd(r.averageAward)}</td>
                    <td>{r.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          Win rate = awards ÷ decided opportunities. A type needs at least {MIN_DECIDED} decided opportunities before a win rate is shown. Amount Received counts all payments on that type&apos;s pipeline items.
        </p>
      </Panel>

      <Panel title="Win rate by funder type" subtitle="Awards ÷ decided opportunities (Awarded or Declined)" sample={sample}>
        <WinRateChart rows={rows} />
      </Panel>
    </div>
  );
}
