"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Brand chart colors: teal first series, rose second series, plum for text. Bars are also named in the legend/table, never color alone. */
export const CHART = {
  primary: "#00b0b5",
  secondary: "#be677c",
  grid: "#eadfe6",
  axis: "#6b5262",
  ink: "#4b1b3c",
} as const;
const TOOLTIP = { contentStyle: { borderRadius: 12, border: "1px solid #eadfe6", color: "#4b1b3c", boxShadow: "0 2px 8px rgb(75 27 60 / 0.08)" } } as const;

const money = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`);
const moneyFull = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const axisProps = { tick: { fill: CHART.axis, fontSize: 12 }, axisLine: false, tickLine: false } as const;
const RADIUS: [number, number, number, number] = [4, 4, 0, 0];

function TableView({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-xs text-muted">
      <summary className="cursor-pointer rounded-full px-3 py-1.5 font-medium text-plum hover:bg-plum-tint">Show as table</summary>
      <table className="mt-1 w-full text-left">
        <thead>
          <tr>{headers.map((h) => <th key={h} className="py-1 pr-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="py-1 pr-3 tabular-nums text-plum">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function CommittedVsReceived({ data }: { data: { month: string; committed: number; received: number }[] }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">No awards or payments recorded yet.</p>;
  return (
    <>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis tickFormatter={money} width={48} {...axisProps} />
            <Tooltip {...TOOLTIP} formatter={(v) => moneyFull(Number(v))} cursor={{ fill: "rgba(75,27,60,0.05)" }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: CHART.axis }} />
            <Bar dataKey="committed" name="Committed (awarded)" fill={CHART.primary} radius={RADIUS} maxBarSize={28} />
            <Bar dataKey="received" name="Received" fill={CHART.secondary} radius={RADIUS} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView headers={["Month", "Committed", "Received"]} rows={data.map((d) => [d.month, moneyFull(d.committed), moneyFull(d.received)])} />
    </>
  );
}

/** Single-series horizontal bars: one hue, no legend (the card title names it). */
export function SingleBars({
  data,
  valueLabel,
  isMoney = true,
}: {
  data: { label: string; value: number }[];
  valueLabel: string;
  isMoney?: boolean;
}) {
  const fmt = (n: number) => (isMoney ? moneyFull(n) : n.toLocaleString("en-US"));
  return (
    <>
      <div style={{ height: Math.max(140, data.length * 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke={CHART.grid} />
            <XAxis type="number" tickFormatter={isMoney ? money : undefined} allowDecimals={false} {...axisProps} />
            <YAxis type="category" dataKey="label" width={96} {...axisProps} />
            <Tooltip {...TOOLTIP} formatter={(v) => [fmt(Number(v)), valueLabel]} cursor={{ fill: "rgba(75,27,60,0.05)" }} />
            <Bar dataKey="value" fill={CHART.primary} radius={[0, 4, 4, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView headers={["", valueLabel]} rows={data.map((d) => [d.label, fmt(d.value)])} />
    </>
  );
}
