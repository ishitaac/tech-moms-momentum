"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TableView } from "@/components/dashboard/charts";
import { money, NOT_RECORDED, type StageGlance, type StrategyRow } from "@/lib/reports-model";

/**
 * Tech-Moms colors for the Reports charts only. The shared CHART constant (used by other pages) is unchanged.
 * plum = Awarded / Committed, turquoise = Received (and open pipeline stages), rose = overdue or urgent, gray = unavailable.
 * Every chart also names its series in text (axis, legend, value labels) and offers "Show as table".
 */
export const REPORT_COLORS = { plum: "#4b1b3c", turquoise: "#40c4c8", rose: "#be677c", gray: "#9a9099" } as const;

const GRID = "#eadfe6";
const AXIS = "#6b5262";
const TOOLTIP = { contentStyle: { borderRadius: 12, border: `1px solid ${GRID}`, color: REPORT_COLORS.plum, boxShadow: "0 2px 8px rgb(75 27 60 / 0.08)" } } as const;
const axisProps = { tick: { fill: AXIS, fontSize: 12 }, axisLine: false, tickLine: false } as const;
const RADIUS: [number, number, number, number] = [4, 4, 0, 0];

const short = (n: number) => (n >= 1000 ? `$${Math.round(n / 100) / 10}K`.replace(".0K", "K") : `$${n}`);
/** Value labels skip zeros so empty bars stay clean; the table view lists every number. */
const label = (v: unknown) => (Number(v) > 0 ? short(Number(v)) : "");
const labelProps = { fontSize: 11, fill: REPORT_COLORS.plum } as const;
const legendProps = { iconType: "circle", wrapperStyle: { fontSize: 12, color: AXIS } } as const;

function Empty({ children }: { children: string }) {
  return <p className="py-10 text-center text-sm text-muted">{children}</p>;
}

/** Chart A: Awarded (plum) vs Cash received (turquoise) by month. */
export function FundingMovementChart({ data }: { data: { month: string; awarded: number; received: number }[] }) {
  if (!data.length) return <Empty>No dated awards or payments recorded yet.</Empty>;
  return (
    <>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis tickFormatter={short} width={52} {...axisProps} />
            <Tooltip {...TOOLTIP} formatter={(v) => money(Number(v))} cursor={{ fill: "rgba(75,27,60,0.05)" }} />
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
      <TableView headers={["Month", "Awarded", "Cash received"]} rows={data.map((d) => [d.month, money(d.awarded), money(d.received)])} />
    </>
  );
}

/** Chart B: dollars by stage. Awarded plum, open stages turquoise, Declined gray. The stage and item count are in the axis text. */
export function PipelineGlanceChart({ data }: { data: StageGlance[] }) {
  if (data.every((d) => d.count === 0)) return <Empty>No pipeline items yet.</Empty>;
  const fill = (stage: StageGlance["stage"]) => (stage === "awarded" ? REPORT_COLORS.plum : stage === "declined" ? REPORT_COLORS.gray : REPORT_COLORS.turquoise);
  const rows = data.map((d) => ({
    name: `${d.label} (${d.count})`,
    value: d.dollars ?? 0,
    text: d.dollars === null ? NOT_RECORDED : short(d.dollars),
    full: d.dollars === null ? NOT_RECORDED : money(d.dollars),
    fill: d.dollars === null ? REPORT_COLORS.gray : fill(d.stage),
  }));
  return (
    <>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 72, left: 8, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tickFormatter={short} {...axisProps} />
            <YAxis type="category" dataKey="name" width={104} {...axisProps} />
            <Tooltip {...TOOLTIP} formatter={(_v, _n, p) => [(p.payload as { full: string }).full, "Dollars"]} cursor={{ fill: "rgba(75,27,60,0.05)" }} />
            <Bar dataKey="value" name="Dollars" radius={[0, 4, 4, 0]} maxBarSize={24}>
              {rows.map((r) => (
                <Cell key={r.name} fill={r.fill} />
              ))}
              <LabelList dataKey="text" position="right" {...labelProps} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-muted">Plum: Awarded (amount awarded). Turquoise: open stages (amount asked). Gray: Declined (amount asked) or not recorded. Item counts are in brackets.</p>
      <TableView
        headers={["Stage (items)", "Dollars"]}
        rows={data.map((d) => [`${d.label} (${d.count})`, d.dollars === null ? NOT_RECORDED : money(d.dollars)])}
      />
    </>
  );
}

/** Win rate by the five stored funder types. A type with fewer than five decided opportunities is labeled "Not enough data" (gray), never 0%. */
export function WinRateChart({ rows }: { rows: StrategyRow[] }) {
  if (rows.every((r) => r.decided === 0)) return <Empty>No decided opportunities yet.</Empty>;
  const data = rows.map((r) => ({
    name: `${r.label} (${r.decided} decided)`,
    value: r.winRate === null ? 0 : Math.round(r.winRate * 100),
    text: r.winRate === null ? "Not enough data" : `${Math.round(r.winRate * 100)}%`,
    fill: r.winRate === null ? REPORT_COLORS.gray : REPORT_COLORS.plum,
  }));
  return (
    <>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 96, left: 8, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} {...axisProps} />
            <YAxis type="category" dataKey="name" width={150} {...axisProps} />
            <Tooltip {...TOOLTIP} formatter={(_v, _n, p) => [(p.payload as { text: string }).text, "Win rate"]} cursor={{ fill: "rgba(75,27,60,0.05)" }} />
            <Bar dataKey="value" name="Win rate" radius={[0, 4, 4, 0]} maxBarSize={24}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
              <LabelList dataKey="text" position="right" {...labelProps} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView headers={["Funder type", "Decided", "Awards", "Win rate"]} rows={rows.map((r) => [r.label, r.decided, r.awards, r.winRate === null ? "Not enough data" : `${Math.round(r.winRate * 100)}%`])} />
    </>
  );
}
