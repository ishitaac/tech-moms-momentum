"use client";

import { useEffect, useState, useTransition } from "react";
import { generateDraft, getDraft, saveDraft, type DraftState } from "@/app/draft-actions";

/** US-10 (stretch, flagged): nothing is generated unless the user clicks; humans edit and own the text. */
export function DraftPanel({ funderId, funderName }: { funderId: number; funderName: string }) {
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    getDraft(funderId).then((d) => {
      setDraft(d);
      setText(d?.body ?? "");
    });
  }, [funderId]);

  const create = () =>
    start(async () => {
      setStatus("Drafting…");
      const r = await generateDraft(funderId);
      if (!r.ok) return setStatus(r.error);
      setDraft(r.draft);
      setText(r.draft.body);
      setStatus(null);
    });

  const save = () =>
    start(async () => {
      const r = await saveDraft(funderId, text);
      setStatus(r.ok ? "Saved." : "Could not save.");
    });

  return (
    <section className="rounded-lg border border-dashed border-rose/40 bg-rose-tint/40 p-3">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-plum">Proposal starting point (optional)</h3>
      {!draft ? (
        <>
          <p className="mb-2 text-xs text-muted">
            Off until you ask. Creates an editable first draft for {funderName} from Tech-Moms&apos; public program facts and this funder&apos;s stated priorities. You edit and own the final text.
          </p>
          <button onClick={create} disabled={pending} className="rounded-full border border-plum/30 bg-card px-3 py-1.5 text-sm font-semibold text-plum hover:bg-rose-tint disabled:opacity-60">
            Draft starting point
          </button>
        </>
      ) : (
        <>
          <label htmlFor={`draft-${funderId}`} className="mb-1 block text-xs font-semibold text-plum">
            AI draft — edit freely
          </label>
          <textarea id={`draft-${funderId}`} value={text} onChange={(e) => setText(e.target.value)} rows={12} className="w-full rounded-[12px] border border-line bg-card p-2 text-sm leading-relaxed" />
          <div className="mt-2 flex items-center gap-2">
            <button onClick={save} disabled={pending} className="rounded-full bg-plum px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
              Save edits
            </button>
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">Source material used</summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-card p-2">{JSON.stringify(draft.sourceMaterial, null, 2)}</pre>
            </details>
          </div>
        </>
      )}
      {status && <p className="mt-2 text-xs text-plum" role="status">{status}</p>}
    </section>
  );
}
