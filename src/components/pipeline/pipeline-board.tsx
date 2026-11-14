"use client";

import { DndContext, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useState, useTransition } from "react";
import { moveStage } from "@/app/actions";
import { STAGES, stageTotal, type PipelineCard, type Stage } from "@/lib/pipeline-model";
import { CheckIcon, CoinsIcon, InfoIcon, PipelineIcon } from "@/components/icons";
import { usd } from "@/components/ui";
import { KpiTile } from "./kpi-tile";
import { PipelineCardView } from "./pipeline-card";
import { STAGE_NAME } from "./stage-names";

export function PipelineBoard({ initialCards }: { initialCards: PipelineCard[] }) {
  const [cards, setCards] = useState(initialCards);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const changeStage = (id: number, stage: Stage) => {
    const before = cards;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage } : c)));
    setError(null);
    startTransition(async () => {
      const r = await moveStage({ id, stage });
      if (!r.ok) {
        setCards(before);
        setError(r.error);
      }
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const stage = e.over?.id as Stage | undefined;
    const id = Number(e.active.id);
    const card = cards.find((c) => c.id === id);
    if (stage && card && card.stage !== stage) changeStage(id, stage);
  };

  const hasSample = cards.some((c) => c.isSample);
  // "Open asks" = open pipeline only (Prospect, LOI, Submitted); committed = awarded; received = payments recorded.
  const openAsks = (["prospect", "loi", "submitted"] as const).reduce((sum, st) => sum + stageTotal(cards, st), 0);
  const committed = stageTotal(cards, "awarded");
  const received = cards.reduce((sum, c) => sum + c.received, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiTile icon={<PipelineIcon className="h-5 w-5" />} label="Open asks" value={usd(openAsks)} caption="Prospect, Letter of Intent, Submitted" tone="plum" />
        <KpiTile icon={<CheckIcon className="h-5 w-5" />} label="Committed" value={usd(committed)} caption="Awarded amounts" tone="teal" />
        <KpiTile icon={<CoinsIcon className="h-5 w-5" />} label="Received" value={usd(received)} caption="Payments recorded" tone="rose" />
      </div>

      {error && <p className="rounded-full bg-rose-tint px-4 py-2 text-body text-plum" role="alert">{error}</p>}
      {hasSample && (
        <p role="note" className="flex items-start gap-2 rounded-[12px] bg-plum-tint px-4 py-2 text-[13px] leading-5 text-muted">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Cards marked <span className="rounded-full border border-line bg-card px-2 py-0.5 text-meta font-medium">SAMPLE</span> are examples so you can see how this works.{" "}
            <a href="/settings" className="font-medium text-plum underline underline-offset-2">Clear them in Settings.</a>
          </span>
        </p>
      )}
      {/* Stable id keeps dnd-kit's aria ids identical on server and client (avoids hydration mismatch). */}
      <DndContext id="pipeline-board" sensors={sensors} onDragEnd={onDragEnd}>
        <div className="relative -mx-4 flex snap-x snap-mandatory items-start gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          {STAGES.map((stage) => (
            <Column key={stage} stage={stage} cards={cards.filter((c) => c.stage === stage)} total={stageTotal(cards, stage)} onStageChange={changeStage} onCardChange={(c) => setCards((cs) => cs.map((x) => (x.id === c.id ? c : x)))} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Column({
  stage,
  cards,
  total,
  onStageChange,
  onCardChange,
}: {
  stage: Stage;
  cards: PipelineCard[];
  total: number;
  onStageChange: (id: number, stage: Stage) => void;
  onCardChange: (c: PipelineCard) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${STAGE_NAME[stage]} column`}
      className={`stage-${stage} w-[272px] shrink-0 snap-start rounded-[16px] p-1 transition-colors ${isOver ? "bg-(--stage-bg) ring-2 ring-plum ring-offset-2 ring-offset-page" : ""}`}
    >
      <header className="flex items-center justify-between gap-2 rounded-[12px] bg-(--stage-bg) px-4 py-3">
        <h2 className="flex items-center gap-2 text-col font-semibold! text-plum">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-(--stage-dot)" aria-hidden="true" />
          {STAGE_NAME[stage]}
        </h2>
        <span className="rounded-full bg-card px-2.5 py-0.5 text-meta font-semibold tabular-nums text-plum" aria-label={`${cards.length} cards`}>{cards.length}</span>
      </header>
      <p className="px-2 pb-3 pt-3 font-semibold leading-none tabular-nums text-plum" title={stage === "awarded" ? "Committed (awarded)" : "Amount asked"}>
        <span className="text-[22px]">{usd(total)}</span>
        <span className="ml-1.5 text-meta font-normal text-muted">{stage === "awarded" ? "committed" : "asked"}</span>
      </p>
      <div className="space-y-3">
        {cards.map((c) => (
          <Draggable key={c.id} id={c.id}>
            <PipelineCardView card={c} onStageChange={onStageChange} onChange={onCardChange} />
          </Draggable>
        ))}
        {cards.length === 0 && (
          <p className="rounded-[12px] border border-dashed border-plum/25 px-3 py-8 text-center text-body text-muted">Drag a funder here</p>
        )}
      </div>
    </section>
  );
}

function Draggable({ id, children }: { id: number; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: String(id) });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} className={`rounded-[12px] ${isDragging ? "relative z-20 rotate-1 scale-[1.03] cursor-grabbing opacity-95 shadow-[0_12px_32px_rgb(75_27_60/0.22)]" : ""}`} {...listeners} {...attributes}>
      {children}
    </div>
  );
}
