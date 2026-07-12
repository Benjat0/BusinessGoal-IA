"use client";

import { Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/ui";
import type {
  AnalysisComparison,
  AnalysisMetricChange,
  AnalyzeResponse,
  DecisionRecord,
  EconomicValueCategory,
  Recommendation,
} from "@/lib/types";
import type { DecisionCenterMode } from "@/lib/decision-center";

export type ComparisonUnavailableReason = "DEMO" | "FIRST_ANALYSIS" | "NO_SNAPSHOT" | "NO_BASELINE";

type DecisionCockpitProps = {
  result: AnalyzeResponse | null;
  recommendations: Recommendation[];
  decisionMode: DecisionCenterMode;
  decisions: DecisionRecord[];
  comparison: AnalysisComparison | null;
  comparisonLoading: boolean;
  comparisonError: string | null;
  comparisonUnavailableReason: ComparisonUnavailableReason | null;
  onOpenWizard: () => void;
  onSelectRecommendation: (recommendation: Recommendation) => void;
  onSelectDecision: (decision: DecisionRecord) => void;
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

function formatDateLabel(date?: string | null) {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  } catch {
    return "—";
  }
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

function economicMagnitudeLabel(category?: string) {
  const map: Record<string, string> = {
    cash_release: "Caja liberable",
    margin_improvement: "Margen mejorable",
    sales_protection: "Margen expuesto",
  };
  return map[category || ""] || "Magnitud económica estimada";
}

function decisionStatusLabel(status: string) {
  const map: Record<string, string> = {
    PENDING: "Pendiente",
    DECIDED: "Decidida",
    IN_PROGRESS: "En ejecución",
    MONITORING: "En seguimiento",
    COMPLETED: "Completada",
    DISCARDED: "Descartada",
  };
  return map[status] || status;
}

function decisionStatusBadgeVariant(status: string) {
  if (status === "COMPLETED") return "value" as const;
  if (status === "DISCARDED") return "neutral" as const;
  if (status === "PENDING") return "signal" as const;
  return "primary" as const;
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

function safeComparisonErrorDetail(error: string | null) {
  if (!error) return null;
  const lower = error.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("stack") || lower.includes("traceback")) return null;
  return error;
}

function statusToneClass(tone?: string) {
  if (tone === "positive") return "text-[var(--value)]";
  if (tone === "warning") return "text-[var(--signal)]";
  return "text-[var(--primary-soft)]";
}

function statusBadgeVariant(tone?: string) {
  if (tone === "positive") return "value" as const;
  if (tone === "warning") return "signal" as const;
  return "primary" as const;
}

export function DecisionCockpit({
  result,
  recommendations,
  decisionMode,
  decisions,
  comparison,
  comparisonLoading,
  comparisonError,
  comparisonUnavailableReason,
  onOpenWizard,
  onSelectRecommendation,
  onSelectDecision,
  onGoToDecisions,
  onGoToAnalysis,
}: DecisionCockpitProps) {
  const isDemo = !result;
  const isLegacy = decisionMode === "LEGACY_ANALYSIS";
  const score = result ? asNumber(result.summary_kpis?.business_score_current) : 82;
  const exposureCategories = result
    ? result.economic_value_summary?.categories ?? []
    : DEMO_EXPOSURE;
  const topDecisions = decisions.slice().sort((a, b) => a.rank - b.rank).slice(0, 3);
  const quality = result
    ? asNumber(result.merge_summary?.merge_quality_score) ?? asNumber(result.file_validation?.quality_score)
    : null;
  const fileQuality = result ? asNumber(result.file_validation?.quality_score) : null;
  const mergeQuality = result ? asNumber(result.merge_summary?.merge_quality_score) : null;
  const productsCount = result ? asNumber(result.summary_kpis?.products_count) : null;
  const businessStatus = result?.business_status;
  const statusText = isDemo ? "Lectura de ejemplo" : businessStatus?.status || "Análisis activo";
  const statusMessage = businessStatus?.message || (isDemo
    ? "Vista demo con datos de ejemplo para explorar la lectura ejecutiva."
    : "El análisis activo concentra las prioridades económicas detectadas.");
  const statusTone = isDemo ? "info" : businessStatus?.tone;

  return (
    <div className="space-y-5">
      <section className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
        <Card variant="elevated" className="p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="page-overline">Situación del negocio</p>
                <Badge variant={isDemo ? "neutral" : "value"}>{isDemo ? "Vista demo" : "Análisis activo"}</Badge>
                <Badge variant={statusBadgeVariant(statusTone)}>{statusText}</Badge>
              </div>
              <h1 className={cn("mt-3 text-3xl font-semibold tracking-normal sm:text-4xl", statusToneClass(statusTone))}>
                {statusText}
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
          <h2 className="mt-3 section-title">Insight del análisis activo</h2>
          <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
            {result
              ? result.executive_summary?.ai_insight || "El análisis activo no incluye un insight ejecutivo adicional."
              : "Datos de ejemplo: la prioridad ejecutiva se concentra en separar liquidez, margen y exposición antes de decidir."}
          </p>
          <Button onClick={onGoToAnalysis} className="mt-5" variant="secondary" size="sm">
            Ver análisis
          </Button>
        </Card>
      </section>

      <Card className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="page-overline">Exposición económica</p>
            <h2 className="mt-2 section-title">Magnitudes económicas separadas</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-[var(--text-secondary)]">
              Magnitudes económicas distintas; no son aditivas.
            </p>
          </div>
          <Badge variant={isDemo ? "neutral" : "primary"}>{isDemo ? "Datos de ejemplo" : "Magnitudes no aditivas"}</Badge>
        </div>
        {exposureCategories.length ? (
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {exposureCategories.slice(0, 3).map((category) => (
              <div key={category.key} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{category.label}</p>
                <p className={cn("mt-3 text-2xl font-semibold", exposureTone(category))}>{formatCurrency(category.value)}</p>
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--text-secondary)]">{category.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm leading-6 text-[var(--text-secondary)]">
            No se han identificado magnitudes económicas que requieran atención con los datos analizados.
          </div>
        )}
      </Card>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="page-overline">Decisiones prioritarias</p>
              <h2 className="mt-2 section-title">Decisiones prioritarias</h2>
            </div>
            <Button onClick={onGoToDecisions} variant="ghost" size="sm">
              Ver todas las decisiones
            </Button>
          </div>
          {isLegacy ? (
            <div className="mt-5 rounded-lg border border-[rgba(239,185,76,0.38)] bg-[rgba(239,185,76,0.1)] p-4 text-sm leading-6 text-[var(--signal)]">
              El análisis activo pertenece a un formato anterior y no incluye decisiones canónicas. Actualiza datos para activar el seguimiento.
            </div>
          ) : topDecisions.length ? (
            <div className="mt-5 space-y-3">
              {topDecisions.map((decision) => (
                <article key={decision.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="grid gap-4 sm:grid-cols-[44px_1fr_auto] sm:items-start">
                    <span className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-xs font-semibold text-[var(--text-muted)]">
                      {String(decision.rank).padStart(2, "0")}
                    </span>
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={decisionStatusBadgeVariant(decision.status)}>{decisionStatusLabel(decision.status)}</Badge>
                        <Badge className={priorityClass(decision.priority)}>{priorityLabel(decision.priority)}</Badge>
                        <Badge variant="primary">{decision.impact_label}</Badge>
                        <Badge variant="neutral">{formatNumber(decision.confidence, 0)}% confianza</Badge>
                        {decision.horizon_label ? <Badge variant="neutral">{decision.horizon_label}</Badge> : null}
                      </div>
                      <h3 className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{decision.title}</h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{decision.detection_summary}</p>
                    </div>
                    <div className="shrink-0 sm:text-right">
                      <p className="text-xs text-[var(--text-muted)]">{decision.impact_label}</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--value)]">{formatCurrency(decision.estimated_impact)}</p>
                      <Button onClick={() => onSelectDecision(decision)} className="mt-3" variant="secondary" size="sm">
                        Ver decisión
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm leading-6 text-[var(--text-secondary)]">
              No se han identificado decisiones prioritarias en el análisis activo.
            </div>
          )}
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
            <p className="page-overline">Contexto del análisis</p>
            <h2 className="mt-2 section-title">Contexto de análisis</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-[var(--text-secondary)]">
              {result
                ? `${result.file_name} · ${formatNumber(result.rows, 0)} filas · ${result.business_profile?.sector_label || "Sector no indicado"}`
                : "Vista demo · Datos de ejemplo · Sin fuentes reales conectadas"}
            </p>
          </div>
          <Badge variant={result ? "value" : "neutral"}>{result ? "Análisis activo" : "Demo"}</Badge>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <ContextPill label="Calidad de datos" value={quality === null ? "—" : `${formatNumber(quality, 0)}%`} />
          <ContextPill label="Modo" value={result?.analysis_mode === "multi_file" ? "Cruce multiarchivo" : result ? "Archivo único" : "Datos de ejemplo"} />
          <ContextPill label="Último análisis" value={result ? formatDateLabel(result.analysis_created_at) : "Demo"} />
          <ContextPill label="Calidad de unión" value={mergeQuality === null ? (fileQuality === null ? "—" : `${formatNumber(fileQuality, 0)}% archivo`) : `${formatNumber(mergeQuality, 0)}%`} />
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
  const safeErrorDetail = safeComparisonErrorDetail(comparisonError);
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
          <p className="page-overline">Qué ha cambiado</p>
          <h2 className="mt-2 section-title">Cambios relevantes</h2>
        </div>
        {comparisonLoading ? <Badge variant="primary">Comparando</Badge> : badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : <Badge variant={isDemo ? "neutral" : "signal"}>{isDemo ? "Demo" : "Sin comparativa"}</Badge>}
      </div>

      {comparisonLoading ? (
        <p className="mt-5 text-sm leading-6 text-[var(--text-secondary)]">Comparando el análisis activo con el histórico local más reciente.</p>
      ) : comparisonError ? (
        <div className="mt-5 rounded-lg border border-[rgba(239,185,76,0.38)] bg-[rgba(239,185,76,0.1)] p-4 text-sm leading-6 text-[var(--signal)]">
          <p className="font-semibold">No se pudo preparar la comparación entre análisis.</p>
          {safeErrorDetail ? <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{safeErrorDetail}</p> : null}
        </div>
      ) : comparison?.changes.length ? (
        <div className="mt-5 space-y-3">
          {comparison.status === "PARTIALLY_COMPARABLE" ? (
            <p className="rounded-lg border border-[rgba(239,185,76,0.38)] bg-[rgba(239,185,76,0.08)] px-3 py-2 text-xs leading-5 text-[var(--signal)]">
              Los análisis presentan diferencias de alcance. Interpreta los cambios con cautela. Se muestran únicamente métricas válidas en ambos análisis.
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
            ? "Los análisis disponibles no son suficientemente comparables para mostrar una evolución fiable."
            : "No hay métricas numéricas válidas en ambos análisis para mostrar cambios."}
        </p>
      ) : (
        <p className="mt-5 text-sm leading-6 text-[var(--text-secondary)]">{emptyReason}</p>
      )}
    </Card>
  );
}
