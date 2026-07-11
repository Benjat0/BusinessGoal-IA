"use client";

import { useMemo, useState } from "react";

import { Badge, Button, Card, DrawerShell, EmptyState } from "@/components/ui";
import {
  allowedDecisionTransitions,
  type DecisionCenterMode,
} from "@/lib/decision-center";
import { cn } from "@/lib/ui";
import type {
  AnalyzeResponse,
  Decision,
  DecisionRecord,
  DecisionStatus,
  RecommendationPriority,
} from "@/lib/types";

type DecisionUpdate = {
  status?: DecisionStatus;
  selected_strategy?: string | null;
  economic_target?: number | null;
  target_date?: string | null;
  user_note?: string | null;
};

type DecisionCenterViewProps = {
  mode: DecisionCenterMode;
  decisions: DecisionRecord[];
  result: AnalyzeResponse | null;
  onOpenWizard: () => void;
  onSelectDecision: (decision: DecisionRecord) => void;
};

type DecisionDetailDrawerProps = {
  decision: DecisionRecord;
  onClose: () => void;
  onUpdate: (decision: DecisionRecord, updates: DecisionUpdate, toastMessage?: string) => void;
};

const DEMO_ANALYSIS_ID = "demo-analysis-v20-3";

export const DEMO_DECISIONS: Decision[] = [
  {
    id: "demo-decision-cash-release",
    decision_key: "excess_stock:cash_release",
    rank: 1,
    title: "Reducir sobrestock en productos de baja rotación",
    decision_type: "excess_stock",
    category: "cash_release",
    status: "PENDING",
    priority: "high",
    estimated_impact: 18400,
    impact_category: "CASH_RELEASE",
    impact_label: "Caja liberable",
    confidence: 91,
    horizon_days: 30,
    horizon_label: "30 días",
    created_at: "2026-07-11T12:00:00Z",
    source_analysis_id: DEMO_ANALYSIS_ID,
    recommendation_ids: ["demo-evidence-cash-1"],
    affected_product_refs: [
      { identity_key: "sku:demo_a_01", identity_type: "SKU", identity_confidence: 0.96, sku: "DEMO-A-01", name: "Pack urbano demo", warnings: [] },
    ],
    affected_products_count: 8,
    detection_summary: "Ocho productos mantienen cobertura superior al objetivo demo con capital inmovilizado relevante.",
    why_it_matters: "La caja queda bloqueada en inventario que rota por debajo del ritmo esperado.",
    recommended_action: "Pausar nuevas compras, revisar stock objetivo y activar una acción comercial limitada.",
    first_step: "Revisar los tres productos con mayor valor inmovilizado y bloquear reposiciones esta semana.",
    expected_business_effect: "Liberar caja y reducir exposición de inventario.",
    driver_hypotheses: ["Compra sobredimensionada", "Demanda reciente inferior a la previsión"],
    evidence_items: [
      {
        id: "demo-evidence-cash-1",
        product_ref: { identity_key: "sku:demo_a_01", identity_type: "SKU", identity_confidence: 0.96, sku: "DEMO-A-01", name: "Pack urbano demo", warnings: [] },
        impact: 4200,
        priority: "high",
        confidence: 91,
        observation: "Cobertura superior al objetivo demo y baja rotación reciente.",
        kpi_snapshot: { stock_units: 140, units_sold: 12, inventory_value: 4200, stock_coverage_days: 280 },
      },
    ],
    selected_strategy: null,
    selected_scenario: null,
    economic_target: null,
    target_date: null,
    user_note: null,
  },
  {
    id: "demo-decision-margin",
    decision_key: "low_margin_high_sales:margin_improvement",
    rank: 2,
    title: "Revisar margen en productos que ya venden",
    decision_type: "low_margin_high_sales",
    category: "margin_improvement",
    status: "PENDING",
    priority: "medium",
    estimated_impact: 6750,
    impact_category: "MARGIN_OPPORTUNITY",
    impact_label: "Margen mejorable",
    confidence: 84,
    horizon_days: 30,
    horizon_label: "14-30 días",
    created_at: "2026-07-11T12:00:00Z",
    source_analysis_id: DEMO_ANALYSIS_ID,
    recommendation_ids: ["demo-evidence-margin-1"],
    affected_product_refs: [
      { identity_key: "name:camiseta_demo", identity_type: "NORMALIZED_NAME", identity_confidence: 0.62, sku: null, name: "Camiseta demo", warnings: ["product_identity_uses_normalized_name"] },
    ],
    affected_products_count: 5,
    detection_summary: "Cinco productos con ventas mantienen margen por debajo del objetivo demo.",
    why_it_matters: "La demanda existe, pero el margen actual limita la rentabilidad por unidad vendida.",
    recommended_action: "Calcular precio mínimo rentable y probar ajuste selectivo o pack de mayor margen.",
    first_step: "Ordenar productos por unidades vendidas y brecha de margen.",
    expected_business_effect: "Mejorar rentabilidad sin depender de vender más unidades.",
    driver_hypotheses: ["Coste de compra elevado", "Descuentos acumulados"],
    evidence_items: [
      {
        id: "demo-evidence-margin-1",
        product_ref: { identity_key: "name:camiseta_demo", identity_type: "NORMALIZED_NAME", identity_confidence: 0.62, sku: null, name: "Camiseta demo", warnings: ["product_identity_uses_normalized_name"] },
        impact: 1800,
        priority: "medium",
        confidence: 84,
        observation: "Ventas relevantes con margen inferior al objetivo demo.",
        kpi_snapshot: { units_sold: 88, gross_margin_pct: 16.5, gross_profit_estimated: 920 },
      },
    ],
    selected_strategy: null,
    selected_scenario: null,
    economic_target: null,
    target_date: null,
    user_note: null,
  },
  {
    id: "demo-decision-stockout",
    decision_key: "stockout_risk:sales_protection",
    rank: 3,
    title: "Proteger disponibilidad en productos con demanda",
    decision_type: "stockout_risk",
    category: "sales_protection",
    status: "PENDING",
    priority: "high",
    estimated_impact: 4200,
    impact_category: "GROSS_MARGIN_AT_RISK",
    impact_label: "Margen expuesto",
    confidence: 87,
    horizon_days: 7,
    horizon_label: "48 horas - 7 días",
    created_at: "2026-07-11T12:00:00Z",
    source_analysis_id: DEMO_ANALYSIS_ID,
    recommendation_ids: ["demo-evidence-stockout-1"],
    affected_product_refs: [
      { identity_key: "sku:demo_b_07", identity_type: "SKU", identity_confidence: 0.96, sku: "DEMO-B-07", name: "Accesorio demo", warnings: [] },
    ],
    affected_products_count: 3,
    detection_summary: "Tres productos con demanda demo mantienen stock bajo frente a su velocidad de venta.",
    why_it_matters: "La falta de disponibilidad puede convertir demanda real en ventas no atendidas.",
    recommended_action: "Confirmar disponibilidad, lanzar reposición prioritaria y definir alerta de mínimo.",
    first_step: "Revisar stock actual y pedido pendiente en los productos de mayor salida.",
    expected_business_effect: "Proteger margen asociado a productos con tracción comercial.",
    driver_hypotheses: ["Punto de reposición bajo", "Reposición no alineada con ventas recientes"],
    evidence_items: [
      {
        id: "demo-evidence-stockout-1",
        product_ref: { identity_key: "sku:demo_b_07", identity_type: "SKU", identity_confidence: 0.96, sku: "DEMO-B-07", name: "Accesorio demo", warnings: [] },
        impact: 1400,
        priority: "high",
        confidence: 87,
        observation: "Demanda reciente alta con pocas unidades disponibles.",
        kpi_snapshot: { stock_units: 2, units_sold: 54, gross_profit_estimated: 1400 },
      },
    ],
    selected_strategy: null,
    selected_scenario: null,
    economic_target: null,
    target_date: null,
    user_note: null,
  },
];

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value || 0 : 0);
}

function formatNumber(value?: number | null, decimals = 0) {
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(Number.isFinite(value) ? value || 0 : 0);
}

function statusLabel(status: DecisionStatus) {
  const map: Record<DecisionStatus, string> = {
    PENDING: "Pendiente",
    DECIDED: "Decidida",
    IN_PROGRESS: "En curso",
    MONITORING: "En seguimiento",
    COMPLETED: "Completada",
    DISCARDED: "Descartada",
  };
  return map[status];
}

function statusBadgeVariant(status: DecisionStatus) {
  if (status === "COMPLETED") return "value" as const;
  if (status === "DISCARDED") return "neutral" as const;
  if (status === "PENDING") return "signal" as const;
  return "primary" as const;
}

function priorityLabel(priority: RecommendationPriority) {
  if (priority === "high") return "Alta";
  if (priority === "medium") return "Media";
  if (priority === "low") return "Baja";
  return priority;
}

function priorityClass(priority: RecommendationPriority) {
  if (priority === "high") return "border-[rgba(244,113,127,0.38)] bg-[rgba(244,113,127,0.12)] text-[var(--risk)]";
  if (priority === "medium") return "border-[rgba(239,185,76,0.38)] bg-[rgba(239,185,76,0.12)] text-[var(--signal)]";
  return "border-[rgba(91,115,242,0.38)] bg-[rgba(91,115,242,0.12)] text-[var(--primary-soft)]";
}

function productLabel(decision: DecisionRecord) {
  return decision.affected_product_refs
    .map((ref) => ref.name || ref.sku || ref.identity_key)
    .filter(Boolean)
    .join(" ");
}

function transitionLabel(status: DecisionStatus) {
  const map: Record<DecisionStatus, string> = {
    PENDING: "Volver a pendiente",
    DECIDED: "Registrar decisión",
    IN_PROGRESS: "Pasar a en curso",
    MONITORING: "Pasar a seguimiento",
    COMPLETED: "Marcar completada",
    DISCARDED: "Descartar",
  };
  return map[status];
}

function lifecycleText(fromStatus: DecisionStatus | null, toStatus: DecisionStatus) {
  return fromStatus ? `${statusLabel(fromStatus)} -> ${statusLabel(toStatus)}` : statusLabel(toStatus);
}

function metricLabel(key: string) {
  const map: Record<string, string> = {
    stock_units: "Stock",
    units_sold: "Unidades vendidas",
    inventory_value: "Valor inventario",
    gross_margin_pct: "Margen bruto",
    gross_profit_estimated: "Margen estimado",
    stock_coverage_days: "Cobertura",
    stock_turnover_90d: "Rotación 90d",
  };
  return map[key] || key;
}

function metricValue(key: string, value: number) {
  if (key === "inventory_value" || key === "gross_profit_estimated") return formatCurrency(value);
  if (key === "gross_margin_pct") return `${formatNumber(value, 1)}%`;
  if (key === "stock_turnover_90d") return formatNumber(value, 2);
  if (key === "stock_coverage_days") return `${formatNumber(value, 0)} días`;
  return formatNumber(value, 0);
}

function summaryCounts(decisions: DecisionRecord[]) {
  return {
    pending: decisions.filter((decision) => decision.status === "PENDING").length,
    active: decisions.filter((decision) => decision.status === "DECIDED" || decision.status === "IN_PROGRESS").length,
    monitoring: decisions.filter((decision) => decision.status === "MONITORING").length,
    completed: decisions.filter((decision) => decision.status === "COMPLETED").length,
  };
}

export function DecisionCenterView({
  mode,
  decisions,
  result,
  onOpenWizard,
  onSelectDecision,
}: DecisionCenterViewProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DecisionStatus | "all">("all");
  const [priority, setPriority] = useState<RecommendationPriority | "all">("all");
  const [category, setCategory] = useState<string>("all");
  const isLegacy = mode === "LEGACY_ANALYSIS";
  const isDemo = mode === "DEMO";
  const counts = summaryCounts(decisions);
  const categories = Array.from(new Set(decisions.map((decision) => decision.category))).sort();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return decisions
      .filter((decision) => status === "all" || decision.status === status)
      .filter((decision) => priority === "all" || decision.priority === priority)
      .filter((decision) => category === "all" || decision.category === category)
      .filter((decision) => {
        if (!term) return true;
        return [
          decision.title,
          decision.detection_summary,
          productLabel(decision),
        ].join(" ").toLowerCase().includes(term);
      })
      .sort((a, b) => a.rank - b.rank);
  }, [category, decisions, priority, search, status]);

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="page-overline">Decision Center</p>
              <Badge variant={isLegacy ? "signal" : isDemo ? "neutral" : "value"}>{mode}</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">Decisiones</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
              Cola priorizada de decisiones canónicas del análisis activo, con registro local y seguimiento de estado.
            </p>
          </div>
          <Button onClick={onOpenWizard} variant="primary">
            {result ? "Actualizar datos" : "Nuevo análisis"}
          </Button>
        </div>
      </Card>

      {isLegacy ? (
        <Card>
          <EmptyState
            title="LEGACY_ANALYSIS"
            text="Este análisis pertenece a un formato anterior. Crea un nuevo análisis o actualiza datos para activar decisiones canónicas."
            action={(
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={onOpenWizard} variant="primary" size="sm">Nuevo análisis</Button>
                <Button onClick={onOpenWizard} variant="secondary" size="sm">Actualizar datos</Button>
              </div>
            )}
          />
        </Card>
      ) : null}

      {!isLegacy ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <SummaryTile label="Pendientes" value={counts.pending} />
            <SummaryTile label="Activas" value={counts.active} />
            <SummaryTile label="En seguimiento" value={counts.monitoring} />
            <SummaryTile label="Completadas" value={counts.completed} />
          </div>

          <Card>
            <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por título, detección o producto"
                className="app-input h-10 rounded-xl px-4 text-sm outline-none"
              />
              <select value={status} onChange={(event) => setStatus(event.target.value as DecisionStatus | "all")} className="app-input h-10 rounded-xl px-3 text-sm outline-none">
                <option value="all">Todos los estados</option>
                {(["PENDING", "DECIDED", "IN_PROGRESS", "MONITORING", "COMPLETED", "DISCARDED"] as DecisionStatus[]).map((item) => (
                  <option key={item} value={item}>{statusLabel(item)}</option>
                ))}
              </select>
              <select value={priority} onChange={(event) => setPriority(event.target.value as RecommendationPriority | "all")} className="app-input h-10 rounded-xl px-3 text-sm outline-none">
                <option value="all">Todas las prioridades</option>
                <option value="high">Alta</option>
                <option value="medium">Media</option>
                <option value="low">Baja</option>
              </select>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="app-input h-10 rounded-xl px-3 text-sm outline-none">
                <option value="all">Todas las categorías</option>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="section-title">Cola priorizada</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Orden según `rank` del backend.</p>
              </div>
              {isDemo ? <Badge variant="neutral">Demo canónica</Badge> : <Badge variant="value">Análisis real</Badge>}
            </div>

            {filtered.length ? (
              <div className="mt-5 space-y-3">
                {filtered.map((decision) => (
                  <article key={decision.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 transition hover:border-[rgba(91,115,242,0.42)]">
                    <div className="grid gap-4 lg:grid-cols-[52px_1fr_auto] lg:items-start">
                      <span className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-sm font-semibold text-[var(--text-secondary)]">
                        {decision.rank}
                      </span>
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={statusBadgeVariant(decision.status)}>{statusLabel(decision.status)}</Badge>
                          <Badge className={priorityClass(decision.priority)}>Prioridad {priorityLabel(decision.priority)}</Badge>
                          <Badge variant="neutral">{decision.impact_label}</Badge>
                          <Badge variant="neutral">{formatNumber(decision.confidence, 0)}% confianza</Badge>
                          {decision.horizon_label ? <Badge variant="neutral">{decision.horizon_label}</Badge> : null}
                          <Badge variant="neutral">{decision.affected_products_count} productos</Badge>
                        </div>
                        <h3 className="mt-3 text-base font-semibold text-[var(--text-primary)]">{decision.title}</h3>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">{decision.detection_summary}</p>
                      </div>
                      <div className="shrink-0 lg:text-right">
                        <p className="text-xs text-[var(--text-muted)]">{decision.impact_label}</p>
                        <p className="mt-1 text-lg font-semibold text-[var(--value)]">{formatCurrency(decision.estimated_impact)}</p>
                        <Button onClick={() => onSelectDecision(decision)} className="mt-3" variant="secondary" size="sm">
                          Ver decisión
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-5">
                <EmptyState
                  title={decisions.length ? "Sin resultados con esos filtros" : "Sin decisiones canónicas"}
                  text={decisions.length ? "Ajusta los filtros para volver a ver la cola." : "El análisis activo no ha generado decisiones canónicas."}
                  action={decisions.length ? undefined : <Button onClick={onOpenWizard} variant="primary" size="sm">Actualizar datos</Button>}
                />
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">{value}</p>
    </Card>
  );
}

export function DecisionDetailDrawer({ decision, onClose, onUpdate }: DecisionDetailDrawerProps) {
  const [selectedStrategy, setSelectedStrategy] = useState(decision.selected_strategy ?? "");
  const [economicTarget, setEconomicTarget] = useState(decision.economic_target === null ? "" : String(decision.economic_target));
  const [targetDate, setTargetDate] = useState(decision.target_date ?? "");
  const [userNote, setUserNote] = useState(decision.user_note ?? "");
  const transitions = allowedDecisionTransitions(decision.status);
  const visibleEvidence = decision.evidence_items.slice(0, 5);

  function submitRegistration() {
    const parsedTarget = economicTarget.trim() ? Number(economicTarget) : null;
    onUpdate(decision, {
      status: "DECIDED",
      selected_strategy: selectedStrategy.trim() || null,
      economic_target: parsedTarget !== null && Number.isFinite(parsedTarget) ? parsedTarget : null,
      target_date: targetDate || null,
      user_note: userNote.trim() || null,
    }, "Decisión registrada.");
  }

  return (
    <DrawerShell
      title={decision.title}
      onClose={onClose}
      eyebrow={(
        <div className="flex flex-wrap gap-2">
          <Badge variant={statusBadgeVariant(decision.status)}>{statusLabel(decision.status)}</Badge>
          <Badge className={priorityClass(decision.priority)}>Prioridad {priorityLabel(decision.priority)}</Badge>
        </div>
      )}
    >
      <div className="mt-6 space-y-5">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Magnitud económica</p>
          <p className="mt-2 text-3xl font-semibold text-[var(--value)]">{formatCurrency(decision.estimated_impact)}</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{decision.impact_label} · {formatNumber(decision.confidence, 0)}% confianza</p>
        </section>

        <TextSection title="Detección" text={decision.detection_summary} />
        <TextSection title="Por qué importa" text={decision.why_it_matters} />
        <TextSection title="Acción recomendada" text={decision.recommended_action} />
        <TextSection title="Primer paso" text={decision.first_step} />
        <TextSection title="Efecto esperado" text={decision.expected_business_effect} />

        {decision.driver_hypotheses.length ? (
          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Hipótesis de causa</p>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
              {decision.driver_hypotheses.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ) : null}

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Productos afectados / evidencia</p>
          <div className="mt-3 space-y-3">
            {visibleEvidence.map((item) => (
              <div key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{item.product_ref.name || item.product_ref.sku || item.product_ref.identity_key}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{item.observation}</p>
                  </div>
                  <Badge variant="neutral">{formatCurrency(item.impact)}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(item.kpi_snapshot)
                    .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
                    .map(([key, value]) => (
                      <Badge key={key} variant="neutral">{metricLabel(key)}: {metricValue(key, value as number)}</Badge>
                    ))}
                </div>
              </div>
            ))}
            {!visibleEvidence.length ? (
              <p className="text-sm leading-6 text-[var(--text-secondary)]">No hay evidencia de producto asociada a esta decisión.</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Registro / ciclo de vida</p>
          {decision.status === "PENDING" ? (
            <div className="mt-4 space-y-3">
              <input value={selectedStrategy} onChange={(event) => setSelectedStrategy(event.target.value)} placeholder="Estrategia seleccionada" className="app-input w-full rounded-xl px-4 py-3 text-sm outline-none" />
              <div className="grid gap-3 sm:grid-cols-2">
                <input value={economicTarget} onChange={(event) => setEconomicTarget(event.target.value)} type="number" placeholder="Objetivo económico" className="app-input w-full rounded-xl px-4 py-3 text-sm outline-none" />
                <input value={targetDate} onChange={(event) => setTargetDate(event.target.value)} type="date" className="app-input w-full rounded-xl px-4 py-3 text-sm outline-none" />
              </div>
              <textarea value={userNote} onChange={(event) => setUserNote(event.target.value)} placeholder="Nota local" className="app-input min-h-24 w-full rounded-xl px-4 py-3 text-sm outline-none" />
              <Button onClick={submitRegistration} variant="primary">Registrar decisión</Button>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 text-sm text-[var(--text-secondary)]">
              {decision.selected_strategy ? <InfoRow label="Estrategia" value={decision.selected_strategy} /> : null}
              {decision.economic_target !== null ? <InfoRow label="Objetivo económico" value={formatCurrency(decision.economic_target)} /> : null}
              {decision.target_date ? <InfoRow label="Fecha objetivo" value={decision.target_date} /> : null}
              {decision.user_note ? <InfoRow label="Nota local" value={decision.user_note} /> : null}
            </div>
          )}

          {transitions.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {transitions.map((nextStatus) => (
                <Button
                  key={nextStatus}
                  onClick={() => onUpdate(decision, { status: nextStatus }, "Estado actualizado.")}
                  variant={nextStatus === "DISCARDED" ? "danger" : "secondary"}
                  size="sm"
                >
                  {transitionLabel(nextStatus)}
                </Button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Timeline local</p>
          {decision.lifecycle.length ? (
            <div className="mt-3 space-y-2">
              {decision.lifecycle.map((event) => (
                <div key={event.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{lifecycleText(event.from_status, event.to_status)}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{event.created_at}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Sin eventos locales todavía.</p>
          )}
        </section>
      </div>
    </DrawerShell>
  );
}

function TextSection({ title, text }: { title: string; text?: string | null }) {
  if (!text) return null;
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{text}</p>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn("rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2")}>
      <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
