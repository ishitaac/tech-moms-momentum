import { Suspense } from "react";
import { FunderList } from "@/components/funders/funder-list";
import { PageHeader } from "@/components/ui";

export default function FundersPage({ searchParams }: PageProps<"/">) {
  return (
    <>
      <PageHeader
        title="Find funding opportunities"
        subtitle="Explore funders and grants that align with Tech-Moms’ mission."
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[16px] bg-card" />}>
        <FunderList searchParams={searchParams} />
      </Suspense>
    </>
  );
}
