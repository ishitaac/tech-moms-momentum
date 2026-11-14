import { Suspense } from "react";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { pipelineCards } from "@/lib/pipeline-queries";
import { requireUser } from "@/lib/auth/session";

async function Board() {
  await requireUser();
  const cards = await pipelineCards();
  return <PipelineBoard initialCards={cards} />;
}

export default function PipelinePage() {
  return (
    <div className="mx-auto max-w-[1280px] sm:-mx-4">
      <header className="mb-6">
        <h1 className="text-display font-semibold text-plum">Funding pipeline</h1>
        <p className="mt-2 text-body text-muted">Track each opportunity from first look to award.</p>
      </header>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[16px] bg-card" />}>
        <Board />
      </Suspense>
    </div>
  );
}
