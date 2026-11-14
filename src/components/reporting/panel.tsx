import type { ReactNode } from "react";
import { Card, Pill } from "@/components/ui";

/** Reporting card with a title, optional subtitle and an optional SAMPLE tag for demo numbers. */
export function Panel({ title, subtitle, sample = false, children, className = "" }: { title: string; subtitle?: string; sample?: boolean; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-medium text-plum">{title}</h2>
        {sample && <Pill tone="neutral">SAMPLE</Pill>}
      </div>
      {subtitle && <p className="mb-4 mt-1 text-sm text-muted">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </Card>
  );
}
