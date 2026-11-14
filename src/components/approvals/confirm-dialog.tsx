"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { BTN } from "@/components/ui";

/**
 * Native <dialog> as a modal: traps focus, closes on Escape, returns focus to the trigger.
 * Used before every consequential action (approve, reject, request changes, send).
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  confirmDisabled,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[min(92vw,30rem)] rounded-[16px] border border-line bg-card p-0 text-plum shadow-card backdrop:bg-plum/40"
    >
      <div className="p-6">
        <h2 id="confirm-title" className="text-section font-semibold">
          {title}
        </h2>
        <div className="mt-3 text-body text-muted">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className={BTN.secondary}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy || confirmDisabled} aria-busy={busy} className={BTN.primary}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
