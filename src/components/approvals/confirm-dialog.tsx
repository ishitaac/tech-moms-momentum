"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { BTN } from "@/components/ui";

/**
 * Native <dialog> (modal): focus is trapped, Escape cancels, focus returns to the opener on close.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onCancel();
      }}
      className="m-auto w-[min(92vw,28rem)] rounded-[16px] border border-line bg-card p-0 text-plum shadow-xl backdrop:bg-plum/40"
    >
      <div className="p-6">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <div id={bodyId} className="mt-2 space-y-2 text-sm text-muted">
          {children}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className={BTN.secondary} onClick={onCancel} disabled={pending} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            className={BTN.primary}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
