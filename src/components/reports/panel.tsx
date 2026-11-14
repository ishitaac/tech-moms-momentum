import type { ReactNode } from "react";
import { Card, Pill } from "@/components/ui";

/** Report card. Same markup as the dashboard's original panel, plus an optional SAMPLE tag for demo numbers. */
export function Panel({ title, subtitle, sample = false, children, className = "" }: { title: string; subtitle?: string; sample?: boolean; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <h2 className="text-lg font-medium text-plum">
        {title}
        {sample && <Pill tone="neutral" className="ml-2 align-middle">SAMPLE</Pill>}
      </h2>
      {subtitle && <p className="mb-4 mt-1 text-sm text-muted">{subtitle}</p>}
      {children}
    </Card>
  );
}

/** Shown above the numbers whenever any SAMPLE (pipeline_items.is_sample) data is included. */
export function SampleNote({ show }: { show: boolean }) {
  if (!show) return null;
  return <p className="text-xs text-muted">Includes SAMPLE pipeline data for the demo (Tech-Moms has no CRM yet).</p>;
}
