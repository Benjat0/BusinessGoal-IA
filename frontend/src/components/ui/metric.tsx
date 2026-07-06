import type { ReactNode } from "react";

import { cn } from "@/lib/ui";

type MetricTone = "neutral" | "primary" | "value" | "ai" | "risk" | "signal";

const toneClasses: Record<MetricTone, string> = {
  neutral: "text-[var(--text-primary)]",
  primary: "text-[var(--primary-soft)]",
  value: "text-[var(--value)]",
  ai: "text-[var(--ai)]",
  risk: "text-[var(--risk)]",
  signal: "text-[var(--signal)]",
};

export function Metric({
  label,
  value,
  supporting,
  tone = "neutral",
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  supporting?: ReactNode;
  tone?: MetricTone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4", className)}>
      <div className="flex items-start gap-3">
        {icon ? <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)]">{icon}</span> : null}
        <p className="text-xs font-medium leading-4 text-[var(--text-secondary)]">{label}</p>
      </div>
      <p className={cn("mt-4 text-2xl font-semibold tracking-normal", toneClasses[tone])}>{value}</p>
      {supporting ? <p className="mt-1 text-xs text-[var(--text-muted)]">{supporting}</p> : null}
    </div>
  );
}
