import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { FundingHealth } from "@/components/reporting/funding-health";
import { Panel } from "@/components/reporting/panel";
import { ReportingTabs } from "@/components/reporting/tabs";
import { parseTab } from "@/lib/reporting-model";

const SKELETON = <div className="h-96 animate-pulse rounded-[16px] bg-card" />;

/** The selected sub-tab is read from ?tab= (a runtime value), so this sits behind Suspense. */
async function ReportingBody({ searchParams }: Pick<PageProps<"/dashboard">, "searchParams">) {
  const tab = parseTab((await searchParams).tab);
  return (
    <>
      <ReportingTabs active={tab} />
      {tab === "funding-health" && <FundingHealth />}
      {tab === "funder-strategy" && (
        <Panel title="Funder Strategy">
          <p className="py-6 text-center text-sm text-muted">Coming in the next step.</p>
        </Panel>
      )}
      {tab === "action-center" && (
        <Panel title="Action Center">
          <p className="py-6 text-center text-sm text-muted">Coming in the next step.</p>
        </Panel>
      )}
    </>
  );
}

export default function ReportingPage(props: PageProps<"/dashboard">) {
  return (
    <>
      <PageHeader title="Reporting" subtitle="Where the money stands, which funders to prioritize, and what needs action next." />
      <Suspense fallback={SKELETON}>
        <ReportingBody searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
