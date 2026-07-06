"use client";

import { Button } from "@/components/ui";
import { cn } from "@/lib/ui";

import { Icon } from "./icon";
import { NAV_GROUPS, PAGE_METADATA, UTILITY_NAV, type TabId } from "./navigation";

function formatAnalysisDate(value?: string | null) {
  if (!value) return "Contexto demo";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "Fecha no disponible";
  }
}

const MOBILE_ITEMS = [...NAV_GROUPS.flatMap((group) => group.items), ...UTILITY_NAV];

export function AppHeader({
  activeTab,
  onTabChange,
  onOpenWizard,
  analysisCreatedAt,
  analysisContext,
  query,
  onQueryChange,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onOpenWizard: () => void;
  analysisCreatedAt?: string | null;
  analysisContext: string;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const page = PAGE_METADATA[activeTab];
  const showCta = page.cta === true;
  const showSearch = page.search === true;

  return (
    <header className="app-header mb-6 border-b border-[var(--border)] pb-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-2xl font-semibold tracking-normal text-[var(--text-primary)] sm:text-3xl">{page.title}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{page.description}</p>
          <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
            <span className="h-2 w-2 rounded-full bg-[var(--value)]" />
            <span className="truncate">Último análisis · {formatAnalysisDate(analysisCreatedAt)} · {analysisContext}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {showSearch ? (
            <label className="flex h-10 min-w-[240px] items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 text-sm text-[var(--text-secondary)]">
              <Icon name="search" className="h-4 w-4" />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Buscar producto..."
                className="w-full bg-transparent outline-none placeholder:text-[var(--text-muted)]"
              />
            </label>
          ) : null}
          {showCta ? (
            <Button onClick={onOpenWizard} variant="primary" size="lg" icon={<Icon name="upload" className="h-4 w-4" />}>
              Actualizar datos
            </Button>
          ) : null}
        </div>
      </div>

      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 xl:hidden" aria-label="Navegación principal">
        {MOBILE_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition",
              activeTab === item.id
                ? "border-[rgba(91,115,242,0.45)] bg-[var(--selected)] text-[var(--text-primary)]"
                : "border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)]",
            )}
          >
            <Icon name={item.icon} className="h-3.5 w-3.5" />
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
