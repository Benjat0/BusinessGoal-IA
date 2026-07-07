"use client";

import { Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/ui";
import type {
  AnalysisComparison,
  AnalysisMetricChange,
  AnalyzeResponse,
  EconomicValueCategory,
  Recommendation,
} from "@/lib/types";

export type ComparisonUnavailableReason = "DEMO" | "FIRST_ANALYSIS" | "NO_SNAPSHOT" | "NO_BASELINE";

type DecisionCockpitProps = {
  result: AnalyzeResponse | null;
  recommendations: Recommendation[];
  comparison: AnalysisComparison | null;
  comparisonLoading: boolean;
  comparisonError: string | null;
  comparisonUnavailableReason: ComparisonUnavailableReason | null;
  onOpenWizard: () => void;
  onSelectRecommendation: (recommendation: Recommendation) => void;
  onGoToDecisions: () => void;
  onGoToAnalysis: () => void;
};

const DEMO_EXPOSURE = [
  {
    key: "demo-cash",
    economic_class: "CASH_RELEASE",
    label: "Caja liberable",
    value: 18400,
    description: "Stock de baja rotación que podría requerir revisión comercial.",
  },
  {
    key: "demo-margin",
    economic_class: "MARGIN_OPPORTUNITY",
    label: "Margen mejorable",
    value: 6750,
    description: "Productos con demanda donde el margen queda por debajo del objetivo.",
  },
  {
    key: "demo-risk",
    economic_class: "GROSS_MARGIN_AT_RISK",
    label: "Margen expuesto",
    value: 4200,
    description: "Margen bruto asociado a disponibilidad limitada en productos con salida.",
  },
];

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function formatCurrency(value?: number | string, decimals = 0) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function formatNumber(value?: number | string, decimals = 0) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function priorityLabel(priority: string) {
  if (priority === "high") return "Alta prioridad";
  if (priority === "medium") return "Media prioridad";
  if (priority === "low") return "Baja prioridad";
  return priority;
}

function priorityClass(priority: string) {
  if (priority === "high") return "border-[rgba(244,113,127,0.38)] bg-[rgba(244,113,127,0.12)] text-[var(--risk)]";
  if (priority === "medium") return "border-[rgba(239,185,76,0.38)] bg-[rgba(239,185,76,0.12)] text-[var(--signal)]";
  return "border-[rgba(91,115,242,0.38)] bg-[rgba(91,115,242,0.12)] text-[var(--primary-soft)]";
}

function recommendationCategoryLabel(category?: string) {
  const map: Record<string, string> = {
    cash_release: "Caja liberable",
    margin_improvement: "Margen mejorable",
    sales_protection: "Margen expuesto",
  };
  return map[category || ""] || "Decisión económica";
}

function exposureTone(category: Pick<EconomicValueCategory, "economic_class"> | { economic_class: string }) {
  if (category.economic_class === "CASH_RELEASE") return "text-[var(--value)]";
  if (category.economic_class === "MARGIN_OPPORTUNITY") return "text-[var(--primary-soft)]";
  if (category.economic_class === "GROSS_MARGIN_AT_RISK") return "text-[var(--signal)]";
  return "text-[var(--text-primary)]";
}

function metricValue(change: AnalysisMetricChange, value: number) {
  if (change.format === "currency") return formatCurrency(value);
  if (change.format === "percent") return `${formatNumber(value, 1)}%`;
  if (change.format === "score") return `${formatNumber(value, 0)}/100`;
  return formatNumber(value, 0);
}

function metricDelta(change: AnalysisMetricChange) {
  const sign = change.delta > 0 ? "+" : change.delta < 0 ? "-" : "";
  const absolute = Math.abs(change.delta);
  if (change.format === "currency") return `${sign}${formatCurrency(absolute)}`;
  if (change.format === "percent") return `${sign}${formatNumber(absolute, 1)} pp`;
  if (change.format === "score") return `${sign}${formatNumber(absolute, 0)} pts`;
  return `${sign}${formatNumber(absolute, 0)}`;
}

function signalClass(signal: string) {
  if (signal === "POSITIVE") return "border-[rgba(42,199,178,0.34)] bg-[rgba(42,199,178,0.1)] text-[var(--value)]";
  if (signal === "NEGATIVE") return "border-[rgba(244,113,127,0.38)] bg-[rgba(244,113,127,0.1)] text-[var(--risk)]";
  return "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)]";
}

function comparisonBadge(comparison: AnalysisComparison) {
  if (comparison.status === "PARTIALLY_COMPARABLE") return { label: "Comparación parcial", variant: "signal" as const };
  if (comparison.status === "NOT_COMPARABLE") return { label: "No comparable", variant: "risk" as const };
  return { label: "Comparable", variant: "value" as const };
}

export function DecisionCockpit({
  result,
  recommendations,
  comparison,
  comparisonLoading,
  comparisonError,
  comparisonUnavailableReason,
  onOpenWizard,
  onSelectRecommendation,
  onGoToDecisions,
  onGoToAnalysis,
}: DecisionCockpitProps) {
  const isDemo = !result;
  const score = result ? asNumber(result.summary_kpis?.business_score_current) : 82;
  const exposureCategories = result?.economic_value_summary?.categories?.length
    ? result.economic_value_summary.categories
    : DEMO_EXPOSURE;
  const topRecommendations = recommendations.slice(0, 3);
  const quality = result
    ? asNumber(result.merge_summary?.merge_quality_score) ?? asNumber(result.file_validation?.quality_score)
    : null;
  const productsCount = result ? asNumber(result.summary_kpis?.products_count) : null;
  const statusMessage = result?.business_status?.message || (isDemo
    ? "Vista demo con datos de ejemplo para explorar la lectura ejecutiva."
    : "El análisis activo concentra las prioridades económicas detectadas.");

  return (
    <div className="space-y-5">
      <section className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
        <Card variant="elevated" className="p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="page-overline">Business Situation</p>
                <Badge variant={isDemo ? "neutral" : "value"}>{isDemo ? "Vista demo" : "Análisis activo"}</Badge>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-normal text-[var(--text-primary)] sm:text-4xl">
                Decision Cockpit
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
                {statusMessage}
              </p>
            </div>
            <Button onClick={onOpenWizard} variant="primary">
              Actualizar datos
            </Button>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-[.7fr_1.3fr]">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-5">
              <p className="text-sm font-semibold text-[var(--text-secondary)]">Business Score</p>
              <div className="mt-4 flex items-end gap-1">
                <span className="text-5xl font-semibold text-[var(--text-primary)]">{score === null ? "—" : formatNumber(score, 0)}</span>
                <span className="pb-2 text-xl font-semibold text-[var(--primary-soft)]">{score === null ? "" : "/100"}</span>
              </div>
              <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">
                Indicador ejecutivo de presión económica y operativa basado en los datos analizados.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <ContextPill label="Productos" value={productsCount === null ? (isDemo ? "Demo" : "—") : formatNumber(productsCount, 0)} />
              <ContextPill label="Fuente" value={result?.analysis_mode === "multi_file" ? "Inventario + ventas" : result ? "Archivo analizado" : "Datos de ejemplo"} />
              <ContextPill label="Periodo" value={result?.analysis_period?.label || "Vista demo"} />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <p className="page-overline">BusinessGoal IA</p>
          <h2 className="mt-3 section-title">Executive Insight</h2>
          <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
            {result?.executive_summary?.ai_insight ||
              "Datos de ejemplo: la prioridad ejecutiva se concentra en separar liquidez, margen y exposición antes de decidir."}
          </p>
          <Button onClick={onGoToAnalysis} className="mt-5" variant="secondary" size="sm">
            Ver análisis
          </Button>
        </Card>
      </section>

      <Card className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="page-overline">Economic Exposure</p>
            <h2 className="mt-2 section-title">Magnitudes económicas separadas</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-[var(--text-secondary)]">
              Caja liberable, margen mejorable y margen expuesto son dimensiones distintas. No se agregan como resultado único.
            </p>
          </div>
          <Badge variant={isDemo ? "neutral" : "primary"}>
            {isDemo ? "Datos de ejemplo" : result?.economic_value_summary?.display_total_role || "LEGACY_DIMENSIONAL_SUM"}
          </Badge>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {exposureCategories.slice(0, 3).map((category) => (
            <div key={category.key} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{category.label}</p>
              <p className={cn("mt-3 text-2xl font-semibold", exposureTone(category))}>{formatCurrency(category.value)}</p>
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--text-secondary)]">{category.description}</p>
            </div>
          ))}
        </div>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="page-overline">Priority Decisions</p>
              <h2 className="mt-2 section-title">Decisiones prioritarias</h2>
            </div>
            <Button onClick={onGoToDecisions} variant="ghost" size="sm">
              Ver todas las decisiones
            </Button>
          </div>
          <div className="mt-5 space-y-3">
            {topRecommendations.map((recommendation, index) => (
              <article key={`${recommendation.title}-${index}`} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={priorityClass(recommendation.priority)}>{priorityLabel(recommendation.priority)}</Badge>
                      <Badge variant="primary">{recommendationCategoryLabel(recommendation.category)}</Badge>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{recommendation.title}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{recommendation.what_happens}</p>
                  </div>
                  <div className="shrink-0 sm:text-right">
                    <p className="text-xs text-[var(--text-muted)]">Magnitud estimada</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--value)]">{formatCurrency(recommendation.economic_impact)}</p>
                    <Button onClick={() => onSelectRecommendation(recommendation)} className="mt-3" variant="secondary" size="sm">
                      Ver decisión
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Card>

        <WhatChanged
          isDemo={isDemo}
          comparison={comparison}
          comparisonLoading={comparisonLoading}
          comparisonError={comparisonError}
          comparisonUnavailableReason={comparisonUnavailableReason}
        />
      </section>

      <Card className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="page-overline">Data Confidence / Analysis Context</p>
            <h2 className="mt-2 section-title">Contexto de análisis</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-[var(--text-secondary)]">
              {result
                ? `${result.file_name} · ${formatNumber(result.rows, 0)} filas · ${result.business_profile?.sector_label || "Sector no indicado"}`
                : "Vista demo · Datos de ejemplo · Sin fuentes reales conectadas"}
            </p>
          </div>
          <Badge variant={result ? "value" : "neutral"}>{result ? "Análisis activo" : "Demo"}</Badge>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <ContextPill label="Calidad de datos" value={quality === null ? "—" : `${formatNumber(quality, 0)}%`} />
          <ContextPill label="Modo" value={result?.analysis_mode === "multi_file" ? "Cruce multiarchivo" : result ? "Archivo único" : "Datos de ejemplo"} />
          <ContextPill label="ID análisis" value={result?.analysis_id ? result.analysis_id.slice(0, 8) : "Demo"} />
        </div>
      </Card>
    </div>
  );
}

function ContextPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function WhatChanged({
  isDemo,
  comparison,
  comparisonLoading,
  comparisonError,
  comparisonUnavailableReason,
}: {
  isDemo: boolean;
  comparison: AnalysisComparison | null;
  comparisonLoading: boolean;
  comparisonError: string | null;
  comparisonUnavailableReason: ComparisonUnavailableReason | null;
}) {
  const badge = comparison ? comparisonBadge(comparison) : null;
  const emptyReason = comparisonUnavailableReason === "FIRST_ANALYSIS"
    ? "Primer análisis real: los cambios aparecerán cuando exista un análisis anterior comparable."
    : comparisonUnavailableReason === "NO_SNAPSHOT"
    ? "El análisis activo no incluye snapshot comparable."
    : comparisonUnavailableReason === "NO_BASELINE"
    ? "No hay un análisis histórico real con snapshot compatible."
    : "Vista demo: no se calculan variaciones sobre datos de ejemplo.";

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="page-overline">What Changed</p>
          <h2 className="mt-2 section-title">Cambios relevantes</h2>
        </div>
        {comparisonLoading ? <Badge variant="primary">Comparando</Badge> : badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : <Badge variant={isDemo ? "neutral" : "signal"}>{isDemo ? "Demo" : "Sin comparativa"}</Badge>}
      </div>

      {comparisonLoading ? (
        <p className="mt-5 text-sm leading-6 text-[var(--text-secondary)]">Comparando el análisis activo con el histórico local más reciente.</p>
      ) : comparisonError ? (
        <div className="mt-5 rounded-lg border border-[rgba(239,185,76,0.38)] bg-[rgba(239,185,76,0.1)] p-4 text-sm leading-6 text-[var(--signal)]">
          {comparisonError}
        </div>
      ) : comparison?.changes.length ? (
        <div className="mt-5 space-y-3">
          {comparison.status === "PARTIALLY_COMPARABLE" ? (
            <p className="rounded-lg border border-[rgba(239,185,76,0.38)] bg-[rgba(239,185,76,0.08)] px-3 py-2 text-xs leading-5 text-[var(--signal)]">
              Comparación parcial: se muestran solo métricas válidas entre ambos análisis.
            </p>
          ) : null}
          {comparison.changes.map((change) => (
            <div key={change.key} className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{change.label}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {metricValue(change, change.baseline_value)} → {metricValue(change, change.candidate_value)}
                </p>
              </div>
              <span className={cn("inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold", signalClass(change.signal))}>
                {metricDelta(change)}
              </span>
            </div>
          ))}
        </div>
      ) : comparison ? (
        <p className="mt-5 text-sm leading-6 text-[var(--text-secondary)]">
          {comparison.status === "NOT_COMPARABLE"
            ? "Los análisis no son comparables con suficiente consistencia, por lo que no se muestran deltas."
            : "No hay métricas numéricas válidas en ambos análisis para mostrar cambios."}
        </p>
      ) : (
        <p className="mt-5 text-sm leading-6 text-[var(--text-secondary)]">{emptyReason}</p>
      )}
    </Card>
  );
}
