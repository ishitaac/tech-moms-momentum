"use client";

import { useSyncExternalStore } from "react";
import { CloseIcon } from "@/components/icons";

const KEY = "ff-trust-banner-dismissed";
const EVENT = "ff-trust-banner";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** First-screen privacy and AI statement (PRD non-functional: Privacy) as one dismissible line. */
export function TrustBanner() {
  // Server snapshot = hidden, so SSR and first client render agree; it appears after hydration if not dismissed.
  const dismissed = useSyncExternalStore(subscribe, read, () => true);
  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // private mode: banner reappears next visit
    }
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <div className="flex items-center gap-3 rounded-full bg-teal-tint px-5 py-2.5 text-sm text-plum" role="region" aria-label="About this data">
      <p className="min-w-0 flex-1">
        <strong className="font-medium">Public data only · no personal data · AI assists, you decide.</strong>{" "}
        <a href="/settings#sources" className="whitespace-nowrap underline underline-offset-2">
          Learn more
        </a>
      </p>
      <button type="button" onClick={dismiss} aria-label="Dismiss this message" className="shrink-0 rounded-full p-1.5 text-plum hover:bg-card">
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
