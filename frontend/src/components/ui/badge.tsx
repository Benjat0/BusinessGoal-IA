import type { HTMLAttributes } from "react";

import { cn } from "@/lib/ui";

type BadgeVariant = "neutral" | "primary" | "value" | "ai" | "risk" | "signal";

const variants: Record<BadgeVariant, string> = {
  neutral: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)]",
  primary: "border-[rgba(91,115,242,0.42)] bg-[rgba(91,115,242,0.14)] text-[var(--primary-soft)]",
  value: "border-[rgba(42,199,178,0.34)] bg-[rgba(42,199,178,0.12)] text-[var(--value)]",
  ai: "border-[rgba(167,139,250,0.38)] bg-[rgba(167,139,250,0.13)] text-[var(--ai)]",
  risk: "border-[rgba(244,113,127,0.38)] bg-[rgba(244,113,127,0.12)] text-[var(--risk)]",
  signal: "border-[rgba(239,185,76,0.38)] bg-[rgba(239,185,76,0.12)] text-[var(--signal)]",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({ variant = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
