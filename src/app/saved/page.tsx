import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { SavedList } from "@/components/saved/saved-list";

export default function SavedPage() {
  return (
    <>
      <PageHeader title="Saved for Later" subtitle="Funders you set aside to come back to. Add one to your pipeline when you are ready." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[16px] bg-card" />}>
        <SavedList />
      </Suspense>
    </>
  );
}
