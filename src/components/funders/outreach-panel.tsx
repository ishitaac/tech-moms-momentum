"use client";

import { useEffect, useState, useTransition } from "react";
import { generateOutreachDraft, getOutreachContext, saveOutreachDraft, type OutreachContext } from "@/app/outreach-actions";
import {
  buildMailtoHref,
  DRAFT_ACTION_LABELS,
  DRAFT_TYPE_LABELS,
  MAX_AMOUNT_CHARS,
  MAX_NOTES_CHARS,
  MAX_PURPOSE_CHARS,
  NOT_CONFIGURED_MESSAGE,
  type OutreachDraft,
} from "@/lib/outreach";

interface Props {
  funderId: number;
  opportunityId: number | null;
}

const inputClass = "w-full rounded-[12px] border border-line bg-card p-2 text-sm";
const labelClass = "mb-1 block text-xs font-semibold text-plum";
const secondaryButton =
  "rounded-full border border-plum/30 bg-card px-3 py-1.5 text-sm font-semibold text-plum hover:bg-rose-tint disabled:opacity-60";

/** Gemini Outreach Assistant: drafts only on click; a human edits, copies, and sends. Never sends email. */
export function OutreachPanel({ funderId, opportunityId }: Props) {
  const [context, setContext] = useState<OutreachContext | null>(null);
  const [purpose, setPurpose] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<OutreachDraft | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getOutreachContext(funderId, opportunityId)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setContext(r.data);
        else setStatus(r.error);
      })
      .catch(() => !cancelled && setStatus("Could not load the outreach assistant."));
    return () => {
      cancelled = true;
    };
  }, [funderId, opportunityId]);

  const create = () =>
    start(async () => {
      setStatus("Creating your draft…");
      try {
        const r = await generateOutreachDraft(funderId, opportunityId, { purpose, amount, notes });
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
        const r = await saveOutreachDraft(funderId, draft);
        setStatus(r.ok ? "Saved." : r.error);
      } catch {
        setStatus("Could not save. Try again.");
      }
    });

  const copy = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      setStatus("Copied.");
    } catch {
      setStatus("Could not copy. Select the text and copy it manually.");
    }
  };

  const update = (patch: Partial<OutreachDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <details className="mt-4 rounded-lg border border-dashed border-rose/40 bg-rose-tint/40 p-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-plum">Gemini Outreach Assistant</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted">AI draft. Check every fact before sending.</p>

        {!context ? (
          !status && <p className="text-xs text-muted">Loading…</p>
        ) : !context.configured ? (
          <p className="text-sm text-plum">{NOT_CONFIGURED_MESSAGE}</p>
        ) : (
          <>
            <div>
              <label htmlFor={`purpose-${funderId}`} className={labelClass}>
                Funding purpose
              </label>
              <input id={`purpose-${funderId}`} value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={MAX_PURPOSE_CHARS} className={inputClass} placeholder="e.g. Trainers for our spring cohort" />
            </div>
            <div>
              <label htmlFor={`amount-${funderId}`} className={labelClass}>
                Amount requested (optional)
              </label>
              <input id={`amount-${funderId}`} value={amount} onChange={(e) => setAmount(e.target.value)} maxLength={MAX_AMOUNT_CHARS} className={inputClass} />
            </div>
            <div>
              <label htmlFor={`notes-${funderId}`} className={labelClass}>
                Notes or program to emphasize (optional)
              </label>
              <textarea id={`notes-${funderId}`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={MAX_NOTES_CHARS} rows={2} className={inputClass} />
            </div>
            <button onClick={create} disabled={pending || !purpose.trim()} className={secondaryButton}>
              {DRAFT_ACTION_LABELS[context.draftType]}
            </button>
          </>
        )}

        {draft && (
          <div className="space-y-3 border-t border-line pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-plum">{DRAFT_TYPE_LABELS[draft.draftType]}</p>
            {draft.draftType === "loi" && (
              <p className="text-xs text-plum">AI-generated starting point — review all facts and funder requirements before submitting.</p>
            )}
            <div>
              <label htmlFor={`subject-${funderId}`} className={labelClass}>
                Subject
              </label>
              <input id={`subject-${funderId}`} value={draft.subject} onChange={(e) => update({ subject: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label htmlFor={`body-${funderId}`} className={labelClass}>
                Message
              </label>
              <textarea id={`body-${funderId}`} value={draft.body} onChange={(e) => update({ body: e.target.value })} rows={14} className={`${inputClass} leading-relaxed`} />
            </div>
            {draft.factsToVerify.length > 0 && (
              <div>
                <p className={labelClass}>Facts to verify</p>
                <ul className="list-disc space-y-1 pl-5 text-xs text-plum">
                  {draft.factsToVerify.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">Source material used</summary>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {sources.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </details>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={copy} className="rounded-full bg-plum px-3 py-1.5 text-sm font-semibold text-white">
                Copy draft
              </button>
              <a href={buildMailtoHref(draft.subject, draft.body)} className={secondaryButton}>
                Open in email
              </a>
              <button onClick={save} disabled={pending} className={secondaryButton}>
                Save draft
              </button>
            </div>
          </div>
        )}

        {status && (
          <p className="text-xs text-plum" role="status" aria-live="polite">
            {status}
          </p>
        )}
      </div>
    </details>
  );
}
