import type { HTMLAttributes } from "react";

import { cn } from "@/lib/ui";

type CardVariant = "default" | "elevated" | "subtle";

const variants: Record<CardVariant, string> = {
  default: "border-[var(--border)] bg-[var(--surface-1)]",
  elevated: "border-[var(--border-strong)] bg-[var(--surface-elevated)] shadow-[0_14px_36px_rgba(15,23,42,0.08)]",
  subtle: "border-[var(--border)] bg-[var(--surface-2)]",
};

type CardProps = HTMLAttributes<HTMLElement> & {
  variant?: CardVariant;
  as?: "section" | "article" | "div";
};

export function Card({ variant = "default", as = "section", className, children, ...props }: CardProps) {
  const Component = as;
  return (
    <Component
      className={cn(
        "rounded-lg border p-5 text-[var(--text-primary)]",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
