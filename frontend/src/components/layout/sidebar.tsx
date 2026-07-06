"use client";

import { cn } from "@/lib/ui";

import { Icon } from "./icon";
import { NAV_GROUPS, UTILITY_NAV, type TabId } from "./navigation";

export function Sidebar({ activeTab, onTabChange }: { activeTab: TabId; onTabChange: (tab: TabId) => void }) {
  return (
    <aside className="app-sidebar fixed inset-y-0 left-0 z-30 hidden w-[280px] flex-col border-r border-[var(--border)] bg-[var(--bg)] px-4 py-5 xl:flex">
      <div className="mb-7 flex items-center gap-3 px-2">
        <div className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--primary-soft)]">
          <Icon name="mark" className="h-5 w-5" />
        </div>
        <div>
          <p className="text-base font-semibold tracking-normal text-[var(--text-primary)]">BusinessGoal</p>
          <p className="text-xs text-[var(--text-muted)]">Decision Intelligence</p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{group.label}</p>
            <div className="space-y-1">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition",
                    activeTab === item.id
                      ? "border border-[rgba(91,115,242,0.45)] bg-[var(--selected)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-[var(--border)] pt-4">
        {UTILITY_NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition",
              activeTab === item.id
                ? "border border-[rgba(91,115,242,0.45)] bg-[var(--selected)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]",
            )}
          >
            <Icon name={item.icon} className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
