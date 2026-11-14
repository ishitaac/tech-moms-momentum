"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { generatePipelineDraft, isPipelineDraftConfigured, savePipelineDraft } from "@/app/pipeline-draft-actions";
import { CloseIcon, SparkleIcon } from "@/components/icons";
import { BTN, typeLabel } from "@/components/ui";
import type { PipelineCard } from "@/lib/pipeline-model";
import { NOT_CONFIGURED_MESSAGE } from "@/lib/outreach";
import {
  buildMailtoHref,
  draftTypeForStage,
  MAX_AMOUNT_CHARS,
  MAX_NOTES_CHARS,
  MAX_PURPOSE_CHARS,
  PIPELINE_DRAFT_UI,
  type PipelineDraft,
  type PipelineDraftType,
} from "@/lib/pipeline-draft";
import { STAGE_NAME } from "./stage-names";

interface Props {
  card: PipelineCard;
  draftType: PipelineDraftType;
  onClose: () => void;
}

/** The one action area added to Prospect and LOI cards. Renders nothing on other stages. */
export function PipelineDraftAction({ card }: { card: PipelineCard }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const draftType = draftTypeForStage(card.stage);
  if (!draftType) return null;
  const ui = PIPELINE_DRAFT_UI[draftType];
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  return (
    <div className="mt-3" {...isolate}>
      <button ref={buttonRef} type="button" onClick={() => setOpen(true)} className={`${BTN.primary} w-full`}>
        <SparkleIcon className="h-4 w-4" />
        {ui.action}
      </button>
      <p className="mt-1.5 text-meta text-muted">{ui.helper}</p>
      {open && <PipelineDraftModal card={card} draftType={draftType} onClose={close} />}
    </div>
  );
}

const field = "w-full rounded-[12px] border border-control bg-card px-3 py-2 text-body text-plum";
const label = "mb-1 block text-sm font-semibold text-plum";

/** Keeps clicks and keys inside the modal from reaching the card's drag listeners (portals bubble in React). */
const isolate = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation() };

export function PipelineDraftModal({ card, draftType, onClose }: Props) {
  const ui = PIPELINE_DRAFT_UI[draftType];
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [purpose, setPurpose] = useState("");
  const [amount, setAmount] = useState(card.amountAsked ? String(card.amountAsked) : "");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<PipelineDraft | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    closeRef.current?.focus();
    let cancelled = false;
    isPipelineDraftConfigured()
      .then((ok) => !cancelled && setConfigured(ok))
      .catch(() => !cancelled && setConfigured(false));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelled = true;
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const generate = () =>
    start(async () => {
      setStatus("Creating your draft… this can take up to a minute.");
      try {
        const r = await generatePipelineDraft(card.id, { purpose, amount, notes });
        if (!r.ok) return setStatus(r.error);
        setDraft(r.data.draft);
        setSources(r.data.sourceMaterial);
        setStatus(null);
      } catch {
        setStatus("Could not create a draft. Try again later.");
      }
    });

  const save = () =>
    start(async () => {
      if (!draft) return;
      try {
        const r = await savePipelineDraft(card.id, draft);
        setStatus(r.ok ? "Draft saved." : r.error);
      } catch {
        setStatus("Could not save. Try again.");
      }
    });

  const copy = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`);
      setStatus("Copied to clipboard.");
    } catch {
      setStatus("Could not copy. Select the text and copy it manually.");
    }
  };

  const update = (patch: Partial<PipelineDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    e.stopPropagation();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex sm:items-center sm:justify-center sm:p-6" onPointerDown={isolate.onPointerDown} onKeyDown={onKeyDown}>
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 hidden bg-plum/30 sm:block" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative flex h-full w-full flex-col overflow-y-auto bg-card shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-[16px]">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-card px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-semibold leading-snug text-plum">{card.funderName}</h2>
            <p className="mt-1 text-sm text-muted">
              {typeLabel(card.funderType)} · Stage: {STAGE_NAME[card.stage]} · Draft: <span className="font-semibold text-plum">{ui.label}</span>
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="rounded-full p-2 text-plum hover:bg-plum-tint" aria-label="Close draft window">
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <p className="rounded-[12px] bg-rose-tint px-4 py-2 text-sm text-plum">AI draft. Check every fact before sending.</p>

          {configured === false ? (
            <p className="text-body text-plum">{NOT_CONFIGURED_MESSAGE}</p>
          ) : (
            <>
              <div>
                <label htmlFor={`${titleId}-purpose`} className={label}>Funding purpose</label>
                <input id={`${titleId}-purpose`} value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={MAX_PURPOSE_CHARS} className={field} placeholder="e.g. Paid trainers for our spring cohort" />
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
                <div>
                  <label htmlFor={`${titleId}-amount`} className={label}>Amount requested (optional)</label>
                  <input id={`${titleId}-amount`} value={amount} onChange={(e) => setAmount(e.target.value)} maxLength={MAX_AMOUNT_CHARS} className={field} />
                </div>
                <div>
                  <label htmlFor={`${titleId}-notes`} className={label}>Notes or program to emphasize (optional)</label>
                  <input id={`${titleId}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={MAX_NOTES_CHARS} className={field} />
                </div>
              </div>
              <button type="button" onClick={generate} disabled={pending || configured === null || !purpose.trim()} className={`${BTN.primary} w-full sm:w-auto`}>
                <SparkleIcon className="h-4 w-4" />
                {draft ? "Regenerate" : ui.generate}
              </button>
            </>
          )}

          {status && (
            <p className="text-sm text-plum" role="status" aria-live="polite">
              {status}
            </p>
          )}

          {draft && (
            <div className="space-y-4 border-t border-line pt-4">
              {draft.draftType === "loi" && (
                <p className="rounded-[12px] border border-rose bg-card px-4 py-2 text-sm text-plum">
                  AI-generated reference draft. Review all facts and funder requirements before submitting.
                </p>
              )}
              <div>
                <label htmlFor={`${titleId}-subject`} className={label}>{draft.draftType === "loi" ? "Title" : "Subject"}</label>
                <input id={`${titleId}-subject`} value={draft.subject} onChange={(e) => update({ subject: e.target.value })} className={field} />
              </div>
              <div>
                <label htmlFor={`${titleId}-body`} className={label}>Draft</label>
                <textarea id={`${titleId}-body`} value={draft.body} onChange={(e) => update({ body: e.target.value })} rows={draft.draftType === "loi" ? 18 : 10} className={`${field} leading-relaxed`} />
              </div>
              {draft.factsToVerify.length > 0 && (
                <div>
                  <p className={label}>Facts to verify</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-plum">
                    {draft.factsToVerify.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}
              <details className="text-sm text-muted">
                <summary className="cursor-pointer font-medium text-plum">Source material used</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 break-words">
                  {sources.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </details>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={generate} disabled={pending || !purpose.trim()} className={BTN.secondary}>Regenerate</button>
                <button type="button" onClick={copy} className={BTN.primary}>Copy draft</button>
                <button type="button" onClick={save} disabled={pending} className={BTN.secondary}>Save draft</button>
                <a href={buildMailtoHref(draft.subject, draft.body)} className={BTN.secondary}>Open in email</a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
