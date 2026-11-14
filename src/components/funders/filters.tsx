"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { SearchIcon } from "@/components/icons";
import { BANDS_LIST, TYPES, type Filters as F } from "@/lib/list-filters";
import { CARD, matchLabel, typeLabel } from "@/components/ui";

const SEARCH_DEBOUNCE_MS = 300;

interface Props {
  filters: F;
  location: "utah" | "national" | null;
  excludedCount: number;
  updated: string;
}

/** One simple filter row, plus a quiet line to switch between the list views. */
export function Filters({ filters, location, excludedCount, updated }: Props) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("funder");
    startTransition(() => router.replace(`${path}?${next.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => set("q", q || null), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const select = "rounded-full border border-line bg-card px-4 py-2.5 text-body text-plum";
  const view = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm ${active ? "bg-plum-tint font-semibold text-plum" : "text-muted hover:text-plum"}`;

  return (
    <div className="space-y-3">
      <div className={`${CARD} flex flex-wrap items-center gap-3 p-3 ${pending ? "opacity-70" : ""}`}>
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            placeholder="Search funders"
            aria-label="Search funders"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-full border border-line bg-card py-2.5 pl-11 pr-4 text-body text-plum placeholder:text-muted"
          />
        </div>
        <select aria-label="Funder type" className={select} value={filters.type ?? ""} onChange={(e) => set("type", e.target.value || null)}>
          <option value="">All funder types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {typeLabel(t)}
            </option>
          ))}
        </select>
        <select aria-label="Location" className={select} value={location ?? ""} onChange={(e) => set("loc", e.target.value || null)}>
          <option value="">All locations</option>
          <option value="utah">Utah</option>
          <option value="national">National</option>
        </select>
        <select aria-label="Fit level" className={select} value={filters.band ?? ""} onChange={(e) => set("band", e.target.value || null)}>
          <option value="">Any fit level</option>
          {BANDS_LIST.map((b) => (
            <option key={b} value={b}>
              {matchLabel(b)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 px-2 text-body text-plum">
          <input type="checkbox" checked={filters.openOnly} onChange={(e) => set("open", e.target.checked ? "1" : null)} className="h-4 w-4 accent-plum" />
          Open opportunities only
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-sm text-muted">
        <span>Showing:</span>
        <button type="button" aria-pressed={filters.view === "shortlist"} className={view(filters.view === "shortlist")} onClick={() => set("view", null)}>
          Top matches
        </button>
        <button type="button" aria-pressed={filters.view === "all"} className={view(filters.view === "all")} onClick={() => set("view", "all")}>
          Everything we looked at
        </button>
        <button type="button" aria-pressed={filters.view === "excluded"} className={view(filters.view === "excluded")} onClick={() => set("view", "excluded")}>
          Hidden ({excludedCount.toLocaleString()})
        </button>
        <span className="ml-auto">Updated {updated}</span>
      </div>
    </div>
  );
}
