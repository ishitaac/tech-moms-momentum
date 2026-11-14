import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { ActionCenter } from "@/components/reports/action-center";
import { FundingHealth } from "@/components/reports/funding-health";
import { FunderStrategy } from "@/components/reports/funder-strategy";
import { ReportTabs } from "@/components/reports/tabs";
import { parseTab } from "@/lib/reports-model";

const SKELETON = <div className="h-96 animate-pulse rounded-[16px] bg-card" />;

/** The selected sub-tab is read from ?tab= (a runtime value), so this sits behind Suspense. */
async function ReportsBody({ searchParams }: Pick<PageProps<"/dashboard">, "searchParams">) {
  const tab = parseTab((await searchParams).tab);
  return (
    <>
      <ReportTabs active={tab} />
      {tab === "funding-health" && <FundingHealth />}
      {tab === "funder-strategy" && <FunderStrategy />}
      {tab === "action-center" && <ActionCenter />}
    </>
  );
}

export default function ReportsPage(props: PageProps<"/dashboard">) {
  return (
    <>
      <PageHeader title="Reports" subtitle="Where the money stands, which funder types respond, and what needs attention next." />
      <Suspense fallback={SKELETON}>
        <ReportsBody searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
