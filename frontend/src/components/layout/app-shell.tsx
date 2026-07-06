"use client";

import type { ReactNode } from "react";

import { AppHeader } from "./app-header";
import { Sidebar } from "./sidebar";
import type { TabId } from "./navigation";

export function AppShell({
  activeTab,
  onTabChange,
  onOpenWizard,
  analysisCreatedAt,
  analysisContext,
  query,
  onQueryChange,
  children,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onOpenWizard: () => void;
  analysisCreatedAt?: string | null;
  analysisContext: string;
  query: string;
  onQueryChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[var(--bg)] text-[var(--text-primary)]">
      <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
      <main className="relative z-10 min-h-screen xl:pl-[280px]">
        <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
          <AppHeader
            activeTab={activeTab}
            onTabChange={onTabChange}
            onOpenWizard={onOpenWizard}
            analysisCreatedAt={analysisCreatedAt}
            analysisContext={analysisContext}
            query={query}
            onQueryChange={onQueryChange}
          />
          {children}
        </div>
      </main>
    </div>
  );
}
