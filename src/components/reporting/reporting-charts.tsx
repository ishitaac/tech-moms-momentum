"use client";

import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TableView } from "@/components/dashboard/charts";
import { PURPOSE_LABELS } from "@/lib/purposes";
import type { PurposeRow } from "@/lib/reporting-model";

/**
 * Reporting-only chart palette. The shared CHART constant (used by the other pages) is unchanged.
 * Every series is also named in a legend and printed as a value label, and each chart has a table view.
 */
export const REPORT_COLORS = { plum: "#4b1b3c", turquoise: "#40c4c8", rose: "#be677c" } as const;

const GRID = "#eadfe6";
const AXIS = "#6b5262";
const TOOLTIP = { contentStyle: { borderRadius: 12, border: `1px solid ${GRID}`, color: REPORT_COLORS.plum, boxShadow: "0 2px 8px rgb(75 27 60 / 0.08)" } } as const;
const axisProps = { tick: { fill: AXIS, fontSize: 12 }, axisLine: false, tickLine: false } as const;
const RADIUS: [number, number, number, number] = [4, 4, 0, 0];

const short = (n: number) => (n >= 1000 ? `$${Math.round(n / 100) / 10}K`.replace(".0K", "K") : `$${n}`);
const full = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
/** Value labels skip zeros so empty bars stay clean; the table view lists every number. */
const label = (v: unknown) => (Number(v) > 0 ? short(Number(v)) : "");
const labelProps = { fontSize: 11, fill: REPORT_COLORS.plum } as const;
const legendProps = { iconType: "circle", wrapperStyle: { fontSize: 12, color: AXIS } } as const;

function Empty({ children }: { children: string }) {
  return <p className="py-10 text-center text-sm text-muted">{children}</p>;
}

export function AwardedVsReceivedChart({ data }: { data: { month: string; awarded: number; received: number }[] }) {
  if (!data.length) return <Empty>No awards or payments recorded yet.</Empty>;
  return (
    <>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis tickFormatter={short} width={52} {...axisProps} />
            <Tooltip {...TOOLTIP} formatter={(v) => full(Number(v))} cursor={{ fill: "rgba(75,27,60,0.05)" }} />
            <Legend {...legendProps} />
            <Bar dataKey="awarded" name="Awarded" fill={REPORT_COLORS.plum} radius={RADIUS} maxBarSize={28}>
              <LabelList position="top" formatter={label} {...labelProps} />
            </Bar>
            <Bar dataKey="received" name="Cash received" fill={REPORT_COLORS.turquoise} radius={RADIUS} maxBarSize={28}>
              <LabelList position="top" formatter={label} {...labelProps} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView headers={["Month", "Awarded", "Cash received"]} rows={data.map((d) => [d.month, full(d.awarded), full(d.received)])} />
    </>
  );
}

export function DollarsByStageChart({ data }: { data: { label: string; count: number; value: number }[] }) {
  if (!data.some((d) => d.value > 0)) return <Empty>No dollars in the pipeline yet.</Empty>;
  const rows = data.map((d) => ({ name: `${d.label} (${d.count})`, value: d.value }));
  return (
    <>
      <div style={{ height: Math.max(180, rows.length * 48) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tickFormatter={short} {...axisProps} />
            <YAxis type="category" dataKey="name" width={104} {...axisProps} />
            <Tooltip {...TOOLTIP} formatter={(v) => [full(Number(v)), "Dollars"]} cursor={{ fill: "rgba(75,27,60,0.05)" }} />
            <Bar dataKey="value" name="Dollars" fill={REPORT_COLORS.turquoise} radius={[0, 4, 4, 0]} maxBarSize={24}>
              <LabelList position="right" formatter={(v: unknown) => short(Number(v))} {...labelProps} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView headers={["Stage (items)", "Dollars"]} rows={rows.map((r) => [r.name, full(r.value)])} />
    </>
  );
}

export function FundingByPurposeChart({ rows }: { rows: PurposeRow[] }) {
  if (!rows.some((r) => r.awarded > 0 || r.goal > 0)) return <Empty>No awards or goals by purpose yet.</Empty>;
  const data = rows.map((r) => ({ name: PURPOSE_LABELS[r.purpose], awarded: r.awarded, received: r.received, stillNeeded: r.stillNeeded }));
  return (
    <>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="name" interval={0} {...axisProps} />
            <YAxis tickFormatter={short} width={52} {...axisProps} />
            <Tooltip {...TOOLTIP} formatter={(v) => full(Number(v))} cursor={{ fill: "rgba(75,27,60,0.05)" }} />
            <Legend {...legendProps} />
            <Bar dataKey="awarded" name="Awarded" fill={REPORT_COLORS.plum} radius={RADIUS} maxBarSize={28}>
              <LabelList position="top" formatter={label} {...labelProps} />
            </Bar>
            <Bar dataKey="received" name="Received" fill={REPORT_COLORS.turquoise} radius={RADIUS} maxBarSize={28}>
              <LabelList position="top" formatter={label} {...labelProps} />
            </Bar>
            <Bar dataKey="stillNeeded" name="Still needed" fill={REPORT_COLORS.rose} radius={RADIUS} maxBarSize={28}>
              <LabelList position="top" formatter={label} {...labelProps} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView
        headers={["Purpose", "Annual goal", "Awarded", "Received", "Still needed"]}
        rows={rows.map((r) => [PURPOSE_LABELS[r.purpose], r.goal > 0 ? full(r.goal) : "No goal set", full(r.awarded), full(r.received), full(r.stillNeeded)])}
      />
    </>
  );
}
