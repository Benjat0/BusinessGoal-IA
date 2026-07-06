import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function DrawerShell({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-sm">
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-[var(--border)] bg-[var(--surface-1)] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            {eyebrow}
            <h2 className="mt-4 text-2xl font-semibold tracking-normal text-[var(--text-primary)]">{title}</h2>
          </div>
          <Button onClick={onClose} variant="secondary" size="sm">Cerrar</Button>
        </div>
        {children}
      </aside>
    </div>
  );
}
