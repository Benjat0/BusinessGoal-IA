import type { ReactNode } from "react";

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border)] bg-[rgba(16,23,32,0.52)] p-8 text-center">
      <p className="text-base font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">{text}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
