import Link from "next/link";
import { SingleBars } from "@/components/dashboard/charts";
import { BellIcon, CheckIcon, ClockIcon, CoinsIcon, PipelineIcon } from "@/components/icons";
import { StatCard, typeLabel, usd } from "@/components/ui";
import { isEnabled } from "@/config/flags";
import { distinctByMonth, fundingMix, giftRanges, winRateByType } from "@/lib/dashboard-model";
import { upcomingDeadlines } from "@/lib/pipeline-queries";
import { awardedVsReceivedByMonth, DUE_SOON_DAYS, dollarsByStage, fundingByPurpose, fundingKpis } from "@/lib/reporting-model";
import { fundingHealthData } from "@/lib/reporting-queries";
import { AwardedVsReceivedChart, DollarsByStageChart, FundingByPurposeChart } from "./reporting-charts";
import { Panel } from "./panel";

export async function FundingHealth() {
  const [data, deadlines] = await Promise.all([fundingHealthData(), upcomingDeadlines()]);
  const { cards, payments, goals, goalsAreSample, dueSoon } = data;
  const kpis = fundingKpis(cards);
  const purposes = fundingByPurpose(cards, goals);
  const hasSample = cards.some((c) => c.isSample);
  const hasGoals = Object.keys(goals).length > 0;
  const full = isEnabled("fullDashboard");

  return (
    <div className="space-y-6">
      {hasSample && <p className="text-xs text-muted">Includes SAMPLE pipeline data for the demo (Tech-Moms has no CRM yet).</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Committed / Awarded Funding" value={usd(kpis.committed)} hint="awarded" icon={<CheckIcon />} tone="teal" />
        <StatCard label="Cash Received" value={usd(kpis.received)} hint="received on awarded items" icon={<CoinsIcon />} tone="rose" />
        <StatCard label="Still to Receive" value={usd(kpis.stillToReceive)} hint="awarded minus received" icon={<ClockIcon />} tone="plum" />
        <StatCard label="Active Funding Requests" value={usd(kpis.activeRequests)} hint="asked, in LOI and Submitted" icon={<PipelineIcon />} tone="teal" />
        <StatCard label="Actions Due Soon" value={dueSoon.length} hint={`application deadlines, next ${DUE_SOON_DAYS} days`} icon={<BellIcon />} tone="rose" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Awarded vs. cash received" subtitle="Awards by award month, payments by month received" sample={hasSample}>
          <AwardedVsReceivedChart data={awardedVsReceivedByMonth(cards, payments)} />
        </Panel>
        <Panel title="Dollars by stage" subtitle="Dollars asked (awarded for the Awarded stage); item counts in brackets" sample={hasSample}>
          <DollarsByStageChart data={dollarsByStage(cards)} />
        </Panel>
      </div>

      <Panel title="Funding by purpose" subtitle="Still needed = annual goal minus awarded, never below zero" sample={hasSample || goalsAreSample}>
        {goalsAreSample && <p className="mb-3 text-xs text-muted">Goals shown are SAMPLE placeholders. Set your own in Settings.</p>}
        {!hasGoals && <p className="mb-3 text-xs text-muted">No annual goals yet, so Still needed shows $0. Set them in Settings.</p>}
        <FundingByPurposeChart rows={purposes.rows} />
        {purposes.unassignedAwarded > 0 && (
          <p className="mt-3 text-xs text-muted">
            {purposes.unassignedAwarded} awarded {purposes.unassignedAwarded === 1 ? "item has" : "items have"} no purpose yet and {purposes.unassignedAwarded === 1 ? "isn't" : "aren't"} counted here. Set one under “Edit amounts” on the{" "}
            <Link href="/pipeline" className="font-medium text-plum underline underline-offset-2">Pipeline</Link>.
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          Edit goals in <Link href="/settings#goals" className="font-medium text-plum underline underline-offset-2">Settings</Link>.
        </p>
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

      {full && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Funding mix" subtitle="Received dollars by funder type">
            <SingleBars valueLabel="Received" data={fundingMix(payments).map((m) => ({ label: typeLabel(m.type), value: m.amount }))} />
          </Panel>
          <Panel title="Gift ranges" subtitle="Number of payments in each size band">
            <SingleBars isMoney={false} valueLabel="Gifts" data={giftRanges(payments).map((g) => ({ label: g.label, value: g.count }))} />
          </Panel>
          <Panel title="Win rate by funder type" subtitle="Awarded ÷ (awarded + declined)">
            <SingleBars isMoney={false} valueLabel="Win rate %" data={winRateByType(cards).map((w) => ({ label: typeLabel(w.type), value: Math.round(w.rate * 100) }))} />
          </Panel>
          <Panel title="Distinct gifts and funders" subtitle="Per month; funders reported as organizations only">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted"><tr><th className="py-1.5">Month</th><th>Gifts</th><th>Funders</th></tr></thead>
              <tbody className="divide-y divide-line">
                {distinctByMonth(payments).map((r) => <tr key={r.month}><td className="py-1.5">{r.month}</td><td className="tabular-nums">{r.gifts}</td><td className="tabular-nums">{r.funders}</td></tr>)}
              </tbody>
            </table>
          </Panel>
        </div>
      )}
    </div>
  );
}
