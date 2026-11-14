import type { CSSProperties, ReactNode } from "react";

/* ---------- Cards ---------- */

/** White card: 16px radius, 1px soft border, light shadow, 20px padding. */
export const CARD = "rounded-[16px] border border-line bg-card shadow-card";

export function Card({ children, className = "", as: Tag = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`${CARD} p-5 ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function StatCard({ label, value, hint, icon, tone = "plum" }: { label: string; value: ReactNode; hint?: ReactNode; icon: ReactNode; tone?: "plum" | "teal" | "rose" }) {
  const toneBg = { plum: "bg-plum-tint", teal: "bg-teal-tint", rose: "bg-rose-tint" }[tone];
  return (
    <div className={`${CARD} flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-5`}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-plum ${toneBg}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-0.5 text-2xl font-medium tabular-nums text-plum">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}

/* ---------- Buttons ---------- */

const BTN_BASE = "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";
export const BTN = {
  primary: `${BTN_BASE} bg-plum text-white hover:bg-plum/90`,
  secondary: `${BTN_BASE} border border-plum/30 bg-card text-plum hover:bg-plum-tint`,
  soft: `${BTN_BASE} border border-rose/50 bg-card text-plum hover:bg-rose-tint`,
  link: "text-sm font-medium text-plum underline decoration-plum/40 underline-offset-4 hover:decoration-plum",
} as const;

/* ---------- Pills (always carry a text label; never color alone) ---------- */

type Tone = "plum" | "teal" | "rose" | "neutral";
const PILL_TONE: Record<Tone, string> = {
  plum: "bg-plum-tint text-plum border-plum/20",
  teal: "bg-teal text-plum border-teal-logo/40", // text on teal fills is always plum
  rose: "bg-rose-tint text-plum border-rose/40",
  neutral: "bg-card text-muted border-line",
};

export function Pill({ children, tone = "neutral", icon, className = "" }: { children: ReactNode; tone?: Tone; icon?: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${PILL_TONE[tone]} ${className}`}>
      {icon}
      {children}
    </span>
  );
}

/** Plain-English names for the stored fit bands (the stored values and filters are unchanged). */
export const MATCH_LABEL: Record<string, string> = { Strong: "Strong alignment", "Worth a look": "Worth a look", "Long shot": "Long shot" };
export const matchLabel = (band: string | null) => (band ? (MATCH_LABEL[band] ?? band) : "");

export function BandBadge({ band }: { band: string | null }) {
  if (!band) return <span className="text-xs text-muted">—</span>;
  return <Pill tone={band === "Strong" ? "teal" : "plum"}>{matchLabel(band)}</Pill>;
}

/** "2026-12-03" → "Dec 3" (dates stay as stored; this only formats them for people). */
export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Large circular fit score: a ring filled to the score, number inside, band named in text beside/below it. */
export function ScoreBadge({ total, band, size = "lg" }: { total: number | null; band: string | null; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "h-[72px] w-[72px]" : "h-14 w-14";
  const color = "var(--teal-strong)"; // fit score ring: 3:1+ against its track in every theme
  const style: CSSProperties = { background: `conic-gradient(${color} ${total ?? 0}%, var(--plum-tint) 0)` };
  return (
    <span
      role="img"
      aria-label={total === null ? "No fit score" : `Fit score ${total} out of 100${band ? `, ${matchLabel(band)}` : ""}`}
      title="Fit score (0–100) — not odds of winning"
      style={style}
      className={`inline-flex shrink-0 items-center justify-center rounded-full p-[5px] ${dim}`}
    >
      <span className="flex h-full w-full flex-col items-center justify-center rounded-full bg-card leading-none">
        <span className={`font-medium tabular-nums text-plum ${size === "lg" ? "text-2xl" : "text-lg"}`}>{total ?? "—"}</span>
        {size === "lg" && <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted">fit</span>}
      </span>
    </span>
  );
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export function ConfidenceDots({ confidence }: { confidence: string | null }) {
  const n = confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
  const label = CONFIDENCE_LABEL[confidence ?? "low"];
  return (
    <span className="inline-flex items-center gap-0.5" title={`${label}: share of score components backed by real evidence`} aria-label={label}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= n ? "bg-plum" : "bg-plum/20"}`} />
      ))}
    </span>
  );
}

/** Only shown when an open call is known; unknown status renders nothing. */
export function OpenCallBadge({ isOpen, deadline }: { isOpen: boolean; deadline: string | null }) {
  if (!isOpen) return null;
  return (
    <>
      <Pill tone="teal">Open now</Pill>
      {deadline && <Pill tone="rose">Due {shortDate(deadline)}</Pill>}
    </>
  );
}

const TYPE_LABEL: Record<string, string> = {
  state: "State grant",
  federal: "Federal grant",
  corporate: "Corporate",
  foundation: "Foundation",
  family_foundation: "Family foundation",
};

export const typeLabel = (t: string) => TYPE_LABEL[t] ?? t;

export function TypeTag({ type }: { type: string }) {
  return <Pill tone="plum">{typeLabel(type)}</Pill>;
}

export function SourceLink({ href, children }: { href: string | null; children?: ReactNode }) {
  if (!href) return <span className="text-xs text-muted">source unknown</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-plum underline decoration-plum/40 underline-offset-2 hover:decoration-plum">
      {children ?? "Source"} ↗
    </a>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-display font-semibold text-plum">{title}</h1>
        {subtitle && <p className="mt-2 text-body text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export const usd = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;

const KEEP_CAPS = new Set(["LLC", "USA", "LOI", "STEM", "YMCA", "YWCA", "PTA", "NAACP"]);
const CONNECTORS = new Set(["OF", "AND", "FOR", "THE", "IN", "ON", "AT", "TO", "OR"]);

function softenWord(w: string, first: boolean): string {
  const trailingDot = w.endsWith(".");
  const bare = trailingDot ? w.slice(0, -1) : w;
  if (KEEP_CAPS.has(bare)) return w;
  const lower = bare.toLowerCase();
  let cased: string;
  if (CONNECTORS.has(bare) && !first) cased = lower;
  else if (bare.length <= 2) cased = bare; // state codes and initials stay as they are
  else cased = lower === "inc" ? "Inc" : lower.charAt(0).toUpperCase() + lower.slice(1);
  return trailingDot ? `${cased}.` : cased;
}

/**
 * Display-only: filings often shout names in ALL CAPS ("BOYS AND GIRLS CLUBS INC").
 * Turns those into normal capitalization without touching the stored text.
 */
export function softenCaps(text: string | null | undefined): string {
  if (!text) return "";
  // Runs of two or more ALL-CAPS words (names), then any single long ALL-CAPS word left over.
  return text
    .replace(/\b[A-Z][A-Z'&.-]*(?:\s+[A-Z][A-Z'&.-]*)+\b\.?/g, (run) => {
      let i = 0;
      return run.split(/(\s+)/).map((tok) => (/^\s+$/.test(tok) ? tok : softenWord(tok, i++ === 0))).join("");
    })
    .replace(/\b[A-Z][A-Z'&.-]{2,}\b\.?/g, (w) => softenWord(w, true));
}
