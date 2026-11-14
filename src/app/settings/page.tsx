import { format } from "date-fns";
import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { Suspense } from "react";
import { db, schema } from "@/db";
import { isEnabled } from "@/config/flags";
import { DEFAULT_WEIGHTS } from "@/config/scoring";
import { UTAH_SOURCES } from "@/config/utah-sources";
import { isAiConfigured, modelId } from "@/lib/ai/provider";
import { SettingsForm } from "@/components/settings/settings-form";
import { RefreshButton, ClearSampleButton } from "@/components/settings/settings-actions";
import { WeightSliders } from "@/components/settings/weight-sliders";
import { Card, PageHeader, SourceLink } from "@/components/ui";
import type { SourceError } from "@/lib/sources/types";

const USAGE_ROWS = 8;

const SOURCES = [
  { id: "irs-990", label: "IRS 990-PF filings (via GivingTuesday 990 data lake)", url: "https://990data.givingtuesday.org/", note: "Loaded locally; new filings appear months after the tax year" },
  { id: "propublica", label: "ProPublica Nonprofit Explorer", url: "https://projects.propublica.org/nonprofits/", note: "Source links for each funder" },
  { id: "grants-gov", label: "Grants.gov (federal)", url: "https://www.grants.gov/", note: "Every refresh" },
  { id: "utah-pages", label: "Utah state listings (DWS)", url: "https://jobs.utah.gov/department/rfg/index.html", note: "Read by AI every refresh" },
  { id: "website", label: "Funder websites", url: null, note: "Shortlisted funders only; read by AI when changed" },
];

function Panel({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <Card id={id} className="scroll-mt-6">
      <h2 className="mb-4 text-lg font-medium text-plum">{title}</h2>
      {children}
    </Card>
  );
}

async function Settings() {
  await connection();
  const [settings] = await db.select().from(schema.settings).limit(1);
  const refreshes = await db.select().from(schema.refreshes).orderBy(desc(schema.refreshes.id)).limit(USAGE_ROWS);
  const last = refreshes.find((r) => r.status === "ok");
  const lastErrors = (last?.sourceErrors as SourceError[] | undefined) ?? [];
  const monthKey = format(new Date(), "yyyy-MM");
  const monthCost = refreshes.filter((r) => format(r.startedAt, "yyyy-MM") === monthKey).reduce((s, r) => s + r.estCostUsd, 0);
  const monthTokens = refreshes.filter((r) => format(r.startedAt, "yyyy-MM") === monthKey).reduce((s, r) => s + r.tokensIn + r.tokensOut, 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Panel title="Notifications">
        <SettingsForm
          initial={{
            notifyEmail: settings?.notifyEmail ?? "",
            alertKinds: (settings?.alertKinds as string[]) ?? ["new_match", "open_call", "deadline"],
            reminderDays: (settings?.reminderDays as number[]) ?? [14, 7, 2],
            snoozeDays: settings?.snoozeDays ?? 30,
          }}
        />
      </Panel>

      <Panel title="Refresh">
        <p className="text-sm text-muted">
          The list refreshes automatically every 14 days. Last successful refresh:{" "}
          <strong className="text-plum">{last ? format(last.startedAt, "MMM d, yyyy h:mm a") : "never"}</strong>.
        </p>
        <p className="mt-1 text-sm text-muted">
          AI: {isAiConfigured() ? <>on — {modelId("extract")} (reading), {modelId("explain")} (explanations)</> : <strong className="text-plum">off (AI_ENABLED is not true) — scoring uses public filings only</strong>}
        </p>
        <div className="mt-3"><RefreshButton /></div>
        {lastErrors.length > 0 && (
          <details className="mt-3 text-xs text-muted">
            <summary className="cursor-pointer">{lastErrors.length} source notes from the last refresh</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">{lastErrors.map((e, i) => <li key={i}>{e.source}: {e.message}</li>)}</ul>
          </details>
        )}
      </Panel>

      <Panel title="AI usage & cost">
        <p className="mb-3 text-sm text-muted">
          This month: <strong className="text-plum">{monthTokens.toLocaleString()} tokens</strong>, est. <strong className="text-plum">${monthCost.toFixed(2)}</strong>. AI only reads shortlisted funders whose pages changed; everything else is cached.
        </p>
        <table className="w-full text-left text-xs">
          <thead className="uppercase tracking-wide text-muted">
            <tr><th className="py-1">Refresh</th><th>AI-read</th><th>Cached</th><th>Tokens</th><th>Est. $</th></tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {refreshes.map((r) => (
              <tr key={r.id} title={r.message ?? undefined}>
                <td className="py-1.5">{format(r.startedAt, "MMM d, HH:mm")} {r.status !== "ok" && <span className="text-plum">({r.status})</span>}</td>
                <td>{r.fundersProcessed}</td>
                <td>{r.fundersSkippedCached}</td>
                <td>{(r.tokensIn + r.tokensOut).toLocaleString()}</td>
                <td>{r.estCostUsd.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">Token cap per refresh: {(settings?.tokenCapPerRefresh ?? 2_000_000).toLocaleString()}. Costs are estimates from list prices.</p>
      </Panel>

      <Panel title="Data sources" id="sources">
        <ul className="space-y-2 text-sm">
          {SOURCES.map((s) => {
            const errs = lastErrors.filter((e) => e.source === s.id).length;
            return (
              <li key={s.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-plum">{s.label}</p>
                  <p className="text-xs text-muted">{s.note}{errs ? ` · ${errs} issue${errs > 1 ? "s" : ""} last refresh` : ""}</p>
                </div>
                {s.url && <SourceLink href={s.url}>Visit</SourceLink>}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs font-semibold text-muted">Check manually (these block automated reading):</p>
        <ul className="text-xs">
          {UTAH_SOURCES.filter((s) => s.manual).map((s) => <li key={s.url}><SourceLink href={s.url}>{s.agency}</SourceLink></li>)}
        </ul>
        <p className="mt-3 text-xs text-muted">No paid databases (Candid is used only by hand for spot-checks). No personal data is stored.</p>
      </Panel>

      {isEnabled("weightTuning") && (
        <Panel title="Fit score weights">
          <WeightSliders initial={(settings?.weights as typeof DEFAULT_WEIGHTS | null) ?? DEFAULT_WEIGHTS} defaults={DEFAULT_WEIGHTS} />
        </Panel>
      )}

      <Panel title="Sample data">
        <p className="text-sm text-muted">The pipeline and dashboard include sample awards and payments (marked SAMPLE) because Tech-Moms has no CRM yet.</p>
        <div className="mt-3"><ClearSampleButton /></div>
      </Panel>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Everything on one screen: alerts, refresh, AI usage, sources." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[16px] bg-card" />}>
        <Settings />
      </Suspense>
    </>
  );
}
