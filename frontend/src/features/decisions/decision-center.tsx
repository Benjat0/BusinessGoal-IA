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
  DecisionScenarioEffects,
  DecisionScenarioOption,
  DecisionStatus,
  EconomicDriverBranch,
  EconomicDriverSeverity,
  EconomicDriverSignal,
  EconomicDriverType,
  EconomicDriverUnit,
  RecommendationPriority,
} from "@/lib/types";

type DecisionUpdate = {
  status?: DecisionStatus;
  selected_strategy?: string | null;
  selected_scenario?: string | null;
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
const ECONOMIC_CLASS = {
  cashRelease: ["CASH", "RELEASE"].join("_"),
  marginOpportunity: ["MARGIN", "OPPORTUNITY"].join("_"),
  grossMarginAtRisk: ["GROSS", "MARGIN", "AT", "RISK"].join("_"),
  other: "OTHER",
} as const;

function scenarioEffects(values: Partial<DecisionScenarioEffects>): DecisionScenarioEffects {
  return {
    cash_release_estimate: values.cash_release_estimate ?? null,
    margin_improvement_estimate: values.margin_improvement_estimate ?? null,
    gross_margin_protected_estimate: values.gross_margin_protected_estimate ?? null,
    net_economic_estimate: values.net_economic_estimate ?? null,
  };
}

function demoScenarioOptions(
  decisionId: string,
  kind: "cash" | "margin" | "stockout",
  baseImpact: number,
): DecisionScenarioOption[] {
  if (kind === "cash") {
    return [
      {
        id: `${decisionId}:conservative`,
        decision_id: decisionId,
        scenario_key: "conservative",
        label: "Conservador",
        description: "Reducir stock objetivo 10% con descuento operativo limitado.",
        scenario_type: "STOCK_REDUCTION",
        parameters: { stock_reduction_pct: 10, max_discount_pct: 5, target_coverage_days: 180 },
        estimated_effects: scenarioEffects({ cash_release_estimate: baseImpact * 0.5, net_economic_estimate: baseImpact * 0.5 }),
        risk_level: "LOW",
        confidence: 90,
        time_horizon_days: 30,
        assumptions: ["La estimación usa la magnitud económica demo como base.", "La caja liberable no equivale a beneficio contable."],
        warnings: ["Validar stock real antes de ejecutar descuentos."],
        recommended: false,
      },
      {
        id: `${decisionId}:recommended`,
        decision_id: decisionId,
        scenario_key: "recommended",
        label: "Recomendado",
        description: "Reducir stock objetivo 20% y revisar reposiciones de productos con baja rotación.",
        scenario_type: "STOCK_REDUCTION",
        parameters: { stock_reduction_pct: 20, max_discount_pct: 10, target_coverage_days: 180 },
        estimated_effects: scenarioEffects({ cash_release_estimate: baseImpact, net_economic_estimate: baseImpact }),
        risk_level: "MEDIUM",
        confidence: 91,
        time_horizon_days: 30,
        assumptions: ["La estimación usa la magnitud económica demo como base.", "El descuento máximo es un supuesto operativo."],
        warnings: ["Caja liberable no debe interpretarse como beneficio."],
        recommended: true,
      },
      {
        id: `${decisionId}:intensive`,
        decision_id: decisionId,
        scenario_key: "intensive",
        label: "Intensivo",
        description: "Reducir stock objetivo 35% con mayor presión comercial y más riesgo operativo.",
        scenario_type: "STOCK_REDUCTION",
        parameters: { stock_reduction_pct: 35, max_discount_pct: 18, target_coverage_days: 120 },
        estimated_effects: scenarioEffects({ cash_release_estimate: Math.round(baseImpact * 1.75), net_economic_estimate: Math.round(baseImpact * 1.75) }),
        risk_level: "HIGH",
        confidence: 85,
        time_horizon_days: 45,
        assumptions: ["La estimación usa la magnitud económica demo como base.", "El escenario requiere seguimiento operativo cercano."],
        warnings: ["Mayor descuento puede tensionar margen y percepción comercial."],
        recommended: false,
      },
    ];
  }

  if (kind === "margin") {
    return [
      {
        id: `${decisionId}:conservative`,
        decision_id: decisionId,
        scenario_key: "conservative",
        label: "Conservador",
        description: "Revisar precio +2% en productos con margen bajo.",
        scenario_type: "MARGIN_REVIEW",
        parameters: { price_adjustment_pct: 2, target_margin_pct: 20, estimated_unit_variation_pct: -2 },
        estimated_effects: scenarioEffects({ margin_improvement_estimate: Math.round(baseImpact * 0.4), net_economic_estimate: Math.round(baseImpact * 0.4) }),
        risk_level: "LOW",
        confidence: 83,
        time_horizon_days: 30,
        assumptions: ["La estimación usa la magnitud económica demo como base.", "La variación de unidades es una hipótesis operativa."],
        warnings: ["Validar reacción comercial antes de aplicar cambios amplios."],
        recommended: false,
      },
      {
        id: `${decisionId}:recommended`,
        decision_id: decisionId,
        scenario_key: "recommended",
        label: "Recomendado",
        description: "Revisar precio +5% y validar margen objetivo antes de escalar.",
        scenario_type: "MARGIN_REVIEW",
        parameters: { price_adjustment_pct: 5, target_margin_pct: 35, estimated_unit_variation_pct: -5 },
        estimated_effects: scenarioEffects({ margin_improvement_estimate: baseImpact, net_economic_estimate: baseImpact }),
        risk_level: "MEDIUM",
        confidence: 84,
        time_horizon_days: 30,
        assumptions: ["La estimación usa la magnitud económica demo como base.", "El ajuste es un escenario para comparar alternativas."],
        warnings: ["El efecto depende de elasticidad de demanda no estimada con estos datos."],
        recommended: true,
      },
      {
        id: `${decisionId}:intensive`,
        decision_id: decisionId,
        scenario_key: "intensive",
        label: "Intensivo",
        description: "Revisar precio +8% con mayor sensibilidad comercial.",
        scenario_type: "MARGIN_REVIEW",
        parameters: { price_adjustment_pct: 8, target_margin_pct: 35, estimated_unit_variation_pct: -10 },
        estimated_effects: scenarioEffects({ margin_improvement_estimate: Math.round(baseImpact * 1.6), net_economic_estimate: Math.round(baseImpact * 1.6) }),
        risk_level: "HIGH",
        confidence: 77,
        time_horizon_days: 30,
        assumptions: ["La estimación usa la magnitud económica demo como base.", "El escenario requiere seguimiento de demanda."],
        warnings: ["Aplicar primero en un subconjunto si el cambio afecta a muchos productos."],
        recommended: false,
      },
    ];
  }

  return [
    {
      id: `${decisionId}:conservative`,
      decision_id: decisionId,
      scenario_key: "conservative",
      label: "Conservador",
      description: "Reponer mínimo de seguridad para reducir exposición inmediata.",
      scenario_type: "STOCKOUT_PROTECTION",
      parameters: { minimum_stock_units: 5, demand_window_days: 7, replenishment_intensity: 0.5 },
      estimated_effects: scenarioEffects({ gross_margin_protected_estimate: baseImpact * 0.5, net_economic_estimate: baseImpact * 0.5 }),
      risk_level: "LOW",
      confidence: 86,
      time_horizon_days: 7,
      assumptions: ["La estimación usa la magnitud económica demo como base.", "El margen protegido es una magnitud expuesta."],
      warnings: ["Validar stock real y pedidos pendientes."],
      recommended: false,
    },
    {
      id: `${decisionId}:recommended`,
      decision_id: decisionId,
      scenario_key: "recommended",
      label: "Recomendado",
      description: "Reponer cobertura estimada de 14 días y revisar productos con mayor salida.",
      scenario_type: "STOCKOUT_PROTECTION",
      parameters: { minimum_stock_units: 10, demand_window_days: 14, replenishment_intensity: 1 },
      estimated_effects: scenarioEffects({ gross_margin_protected_estimate: baseImpact, net_economic_estimate: baseImpact }),
      risk_level: "MEDIUM",
      confidence: 87,
      time_horizon_days: 14,
      assumptions: ["La estimación usa la magnitud económica demo como base.", "La cobertura de reposición es un supuesto de escenario."],
      warnings: ["El margen expuesto no equivale a venta perdida confirmada."],
      recommended: true,
    },
    {
      id: `${decisionId}:intensive`,
      decision_id: decisionId,
      scenario_key: "intensive",
      label: "Intensivo",
      description: "Reponer cobertura estimada de 30 días con mayor inmovilización operativa.",
      scenario_type: "STOCKOUT_PROTECTION",
      parameters: { minimum_stock_units: 20, demand_window_days: 30, replenishment_intensity: 1.5 },
      estimated_effects: scenarioEffects({ gross_margin_protected_estimate: baseImpact * 1.5, net_economic_estimate: baseImpact * 1.5 }),
      risk_level: "HIGH",
      confidence: 82,
      time_horizon_days: 30,
      assumptions: ["La estimación usa la magnitud económica demo como base.", "El escenario incrementa la exposición de stock."],
      warnings: ["Validar plazo de proveedor antes de ampliar cobertura."],
      recommended: false,
    },
  ];
}

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
    impact_category: ECONOMIC_CLASS.cashRelease,
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
    scenario_options: demoScenarioOptions("demo-decision-cash-release", "cash", 18400),
    economic_driver_tree: {
      decision_id: "demo-decision-cash-release",
      decision_key: "excess_stock:cash_release",
      primary_driver: {
        key: "cash_release",
        label: "Caja liberable",
        economic_class: ECONOMIC_CLASS.cashRelease,
        value: 18400,
        unit: "EUR",
        explanation: "Caja liberable: magnitud económica estimada basada en inventario con cobertura elevada.",
      },
      branches: [
        {
          key: "demo-decision-cash-release:economic-driver",
          label: "Caja liberable",
          driver_type: "CAPITAL",
          severity: "HIGH",
          signals: [
            {
              key: "inventory_value",
              label: "Valor de inventario",
              observed_value: 4200,
              threshold_value: null,
              unit: "EUR",
              direction: "PRESENT",
              explanation: "Valor de inventario: señal observada en la evidencia disponible.",
              product_refs: [
                { identity_key: "sku:demo_a_01", identity_type: "SKU", identity_confidence: 0.96, sku: "DEMO-A-01", name: "Pack urbano demo", warnings: [] },
              ],
            },
            {
              key: "stock_coverage_days",
              label: "Cobertura de stock",
              observed_value: 280,
              threshold_value: 180,
              unit: "DAYS",
              direction: "ABOVE_THRESHOLD",
              explanation: "Cobertura de stock: señal observada por encima del umbral disponible.",
              product_refs: [
                { identity_key: "sku:demo_a_01", identity_type: "SKU", identity_confidence: 0.96, sku: "DEMO-A-01", name: "Pack urbano demo", warnings: [] },
              ],
            },
          ],
          evidence_item_ids: ["demo-evidence-cash-1"],
          hypotheses: ["Compra sobredimensionada", "Demanda reciente inferior a la previsión"],
        },
      ],
      data_limitations: ["Lectura demo basada en señales de ejemplo; no implica causalidad confirmada."],
      explanation_summary: "Prioridad basada en los datos analizados: caja liberable con señales observadas de cobertura e inventario.",
    },
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
    impact_category: ECONOMIC_CLASS.marginOpportunity,
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
    scenario_options: demoScenarioOptions("demo-decision-margin", "margin", 6750),
    economic_driver_tree: {
      decision_id: "demo-decision-margin",
      decision_key: "low_margin_high_sales:margin_improvement",
      primary_driver: {
        key: "margin_improvement",
        label: "Margen mejorable",
        economic_class: ECONOMIC_CLASS.marginOpportunity,
        value: 6750,
        unit: "EUR",
        explanation: "Margen mejorable: magnitud económica estimada basada en ventas con margen inferior al objetivo.",
      },
      branches: [
        {
          key: "demo-decision-margin:economic-driver",
          label: "Margen mejorable",
          driver_type: "MARGIN",
          severity: "MEDIUM",
          signals: [
            {
              key: "gross_margin_pct",
              label: "Margen bruto",
              observed_value: 16.5,
              threshold_value: 20,
              unit: "PCT",
              direction: "BELOW_THRESHOLD",
              explanation: "Margen bruto: señal observada por debajo del umbral disponible.",
              product_refs: [
                { identity_key: "name:camiseta_demo", identity_type: "NORMALIZED_NAME", identity_confidence: 0.62, sku: null, name: "Camiseta demo", warnings: ["product_identity_uses_normalized_name"] },
              ],
            },
            {
              key: "units_sold",
              label: "Unidades vendidas",
              observed_value: 88,
              threshold_value: 10,
              unit: "UNITS",
              direction: "ABOVE_THRESHOLD",
              explanation: "Unidades vendidas: señal observada por encima del umbral disponible.",
              product_refs: [
                { identity_key: "name:camiseta_demo", identity_type: "NORMALIZED_NAME", identity_confidence: 0.62, sku: null, name: "Camiseta demo", warnings: ["product_identity_uses_normalized_name"] },
              ],
            },
          ],
          evidence_item_ids: ["demo-evidence-margin-1"],
          hypotheses: ["Coste de compra elevado", "Descuentos acumulados"],
        },
      ],
      data_limitations: ["La identidad de producto demo usa nombre normalizado; conviene confirmar SKU antes de ejecutar."],
      explanation_summary: "Prioridad basada en los datos analizados: margen mejorable con ventas observadas y margen por debajo del objetivo.",
    },
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
    impact_category: ECONOMIC_CLASS.grossMarginAtRisk,
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
    scenario_options: demoScenarioOptions("demo-decision-stockout", "stockout", 4200),
    economic_driver_tree: {
      decision_id: "demo-decision-stockout",
      decision_key: "stockout_risk:sales_protection",
      primary_driver: {
        key: "sales_protection",
        label: "Margen expuesto",
        economic_class: ECONOMIC_CLASS.grossMarginAtRisk,
        value: 4200,
        unit: "EUR",
        explanation: "Margen expuesto: magnitud económica estimada basada en demanda reciente y stock bajo.",
      },
      branches: [
        {
          key: "demo-decision-stockout:economic-driver",
          label: "Margen expuesto",
          driver_type: "SALES_RISK",
          severity: "HIGH",
          signals: [
            {
              key: "stock_units",
              label: "Stock disponible",
              observed_value: 2,
              threshold_value: 8.1,
              unit: "UNITS",
              direction: "BELOW_THRESHOLD",
              explanation: "Stock disponible: señal observada por debajo del umbral disponible.",
              product_refs: [
                { identity_key: "sku:demo_b_07", identity_type: "SKU", identity_confidence: 0.96, sku: "DEMO-B-07", name: "Accesorio demo", warnings: [] },
              ],
            },
            {
              key: "units_sold",
              label: "Unidades vendidas",
              observed_value: 54,
              threshold_value: 20,
              unit: "UNITS",
              direction: "ABOVE_THRESHOLD",
              explanation: "Unidades vendidas: señal observada por encima del umbral disponible.",
              product_refs: [
                { identity_key: "sku:demo_b_07", identity_type: "SKU", identity_confidence: 0.96, sku: "DEMO-B-07", name: "Accesorio demo", warnings: [] },
              ],
            },
          ],
          evidence_item_ids: ["demo-evidence-stockout-1"],
          hypotheses: ["Punto de reposición bajo", "Reposición no alineada con ventas recientes"],
        },
      ],
      data_limitations: ["Lectura demo basada en una señal de producto; no valida una relación causal."],
      explanation_summary: "Prioridad basada en los datos analizados: margen expuesto con señales observadas de demanda reciente y stock bajo.",
    },
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
    IN_PROGRESS: "En ejecución",
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
    IN_PROGRESS: "Pasar a ejecución",
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

function driverTypeLabel(type: EconomicDriverType) {
  const map: Record<string, string> = {
    CAPITAL: "Capital",
    MARGIN: "Margen",
    SALES_RISK: "Riesgo comercial",
    DATA_QUALITY: "Calidad de datos",
    OTHER: "Otro",
  };
  return map[type] || type;
}

function severityLabel(severity: EconomicDriverSeverity) {
  const map: Record<string, string> = {
    HIGH: "Alta",
    MEDIUM: "Media",
    LOW: "Baja",
    UNKNOWN: "No determinada",
  };
  return map[severity] || severity;
}

function signalDirectionLabel(direction: string) {
  const map: Record<string, string> = {
    ABOVE_THRESHOLD: "Sobre umbral",
    BELOW_THRESHOLD: "Bajo umbral",
    PRESENT: "Presente",
    MISSING: "Métrica no disponible",
  };
  return map[direction] || direction;
}

function economicDriverValue(value: number | null | undefined, unit: EconomicDriverUnit) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Sin dato";
  if (unit === "EUR") return formatCurrency(value);
  if (unit === "PCT") return `${formatNumber(value, 1)}%`;
  if (unit === "DAYS") return `${formatNumber(value, 0)} días`;
  if (unit === "RATIO") return formatNumber(value, 2);
  if (unit === "UNITS") return formatNumber(value, 0);
  return formatNumber(value, 2);
}

function productCountText(count: number): string {
  return `${formatNumber(count, 0)} ${count === 1 ? "producto" : "productos"}`;
}

function evidenceCountText(count: number): string {
  return `${formatNumber(count, 0)} ${count === 1 ? "evidencia asociada" : "evidencias asociadas"}`;
}

function economicClassLabel(value: string): string {
  const map: Record<string, string> = {
    [ECONOMIC_CLASS.cashRelease]: "Caja liberable",
    [ECONOMIC_CLASS.marginOpportunity]: "Margen mejorable",
    [ECONOMIC_CLASS.grossMarginAtRisk]: "Margen expuesto",
    [ECONOMIC_CLASS.other]: "Magnitud económica estimada",
  };
  return map[value] || "Magnitud económica estimada";
}

function scenarioPrimaryEstimate(scenario: DecisionScenarioOption): number | null {
  const effects = scenario.estimated_effects;
  return (
    effects.cash_release_estimate
    ?? effects.margin_improvement_estimate
    ?? effects.gross_margin_protected_estimate
    ?? effects.net_economic_estimate
    ?? null
  );
}

function scenarioImpactLabel(scenario: DecisionScenarioOption): string {
  if (scenario.estimated_effects.cash_release_estimate !== null) return "Caja liberable";
  if (scenario.estimated_effects.margin_improvement_estimate !== null) return "Margen mejorable";
  if (scenario.estimated_effects.gross_margin_protected_estimate !== null) return "Margen expuesto";
  return "Magnitud económica estimada";
}

function formatScenarioEstimate(value: number | null): string {
  return value === null ? "Sin estimación" : formatCurrency(value);
}

function scenarioRiskLabel(risk: DecisionScenarioOption["risk_level"]): string {
  if (risk === "LOW") return "Bajo";
  if (risk === "MEDIUM") return "Medio";
  return "Alto";
}

function scenarioRiskVariant(risk: DecisionScenarioOption["risk_level"]) {
  if (risk === "HIGH") return "signal" as const;
  if (risk === "MEDIUM") return "primary" as const;
  return "value" as const;
}

function scenarioParameterLabel(key: string): string {
  const map: Record<string, string> = {
    stock_reduction_pct: "Reducción stock",
    max_discount_pct: "Descuento máximo",
    target_coverage_days: "Cobertura objetivo",
    price_adjustment_pct: "Ajuste precio",
    target_margin_pct: "Margen objetivo",
    estimated_unit_variation_pct: "Variación unidades",
    minimum_stock_units: "Stock mínimo",
    demand_window_days: "Ventana demanda",
    replenishment_intensity: "Intensidad reposición",
    relative_intensity: "Intensidad relativa",
  };
  return map[key] || key;
}

function scenarioParameterValue(key: string, value: string | number | boolean | null): string {
  if (value === null) return "Sin dato";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "string") return value;
  if (key.endsWith("_pct")) return `${formatNumber(value, 0)}%`;
  if (key.endsWith("_days")) return `${formatNumber(value, 0)} días`;
  if (key.endsWith("_units")) return `${formatNumber(value, 0)} uds`;
  if (key.includes("intensity")) return formatNumber(value, 2);
  return formatNumber(value, 0);
}

function evidenceProductLabel(item: DecisionRecord["evidence_items"][number]) {
  return item.product_ref.name || item.product_ref.sku || item.product_ref.identity_key || item.id.slice(0, 8);
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
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Ordenadas por prioridad económica y urgencia.</p>
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
                          <Badge variant="neutral">{productCountText(decision.affected_products_count)}</Badge>
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
  const [selectedScenarioId, setSelectedScenarioId] = useState(decision.selected_scenario ?? "");
  const [economicTarget, setEconomicTarget] = useState(decision.economic_target === null ? "" : String(decision.economic_target));
  const [targetDate, setTargetDate] = useState(decision.target_date ?? "");
  const [userNote, setUserNote] = useState(decision.user_note ?? "");
  const transitions = allowedDecisionTransitions(decision.status);
  const secondaryTransitions = decision.status === "PENDING"
    ? transitions.filter((nextStatus) => nextStatus !== "DECIDED")
    : transitions;
  const visibleEvidence = decision.evidence_items.slice(0, 5);
  const selectedScenario = decision.scenario_options?.find((scenario) => scenario.id === selectedScenarioId) ?? null;

  function useScenario(scenario: DecisionScenarioOption) {
    const estimate = scenarioPrimaryEstimate(scenario);
    setSelectedScenarioId(scenario.id);
    setSelectedStrategy(`${scenario.label}: ${scenario.description}`);
    if (estimate !== null) setEconomicTarget(String(estimate));
  }

  function submitRegistration() {
    const parsedTarget = economicTarget.trim() ? Number(economicTarget) : null;
    onUpdate(decision, {
      status: "DECIDED",
      selected_strategy: selectedStrategy.trim() || null,
      selected_scenario: selectedScenarioId || null,
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

        <EconomicDriverTreeSection decision={decision} />

        <DecisionScenarioSection
          decision={decision}
          selectedScenarioId={selectedScenarioId}
          onUseScenario={useScenario}
        />

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
              {selectedScenario ? (
                <InfoRow
                  label="Escenario seleccionado"
                  value={`${selectedScenario.label} · ${scenarioImpactLabel(selectedScenario)} ${formatScenarioEstimate(scenarioPrimaryEstimate(selectedScenario))}`}
                />
              ) : null}
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
              {decision.selected_scenario ? <InfoRow label="Escenario seleccionado" value={decision.selected_scenario.split(":").pop() || decision.selected_scenario} /> : null}
              {decision.selected_strategy ? <InfoRow label="Estrategia" value={decision.selected_strategy} /> : null}
              {decision.economic_target !== null ? <InfoRow label="Objetivo económico" value={formatCurrency(decision.economic_target)} /> : null}
              {decision.target_date ? <InfoRow label="Fecha objetivo" value={decision.target_date} /> : null}
              {decision.user_note ? <InfoRow label="Nota local" value={decision.user_note} /> : null}
            </div>
          )}

          {secondaryTransitions.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {secondaryTransitions.map((nextStatus) => (
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

function DecisionScenarioSection({
  decision,
  selectedScenarioId,
  onUseScenario,
}: {
  decision: DecisionRecord;
  selectedScenarioId: string;
  onUseScenario: (scenario: DecisionScenarioOption) => void;
}) {
  const scenarios = decision.scenario_options ?? [];
  if (!scenarios.length) return null;

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Escenarios de decisión</p>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
            Compara alternativas orientativas antes de registrar la decisión. Las cifras son estimaciones basadas en los datos analizados.
          </p>
        </div>
        <Badge variant="neutral">{scenarios.length} escenarios</Badge>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        {scenarios.map((scenario) => {
          const estimate = scenarioPrimaryEstimate(scenario);
          const selected = selectedScenarioId === scenario.id;
          return (
            <article
              key={scenario.id}
              className={cn(
                "rounded-lg border bg-[var(--surface-1)] p-4",
                selected ? "border-[rgba(91,115,242,0.52)]" : "border-[var(--border)]",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={selected ? "primary" : "neutral"}>{scenario.label}</Badge>
                {scenario.recommended ? <Badge variant="value">Recomendado</Badge> : null}
                <Badge variant={scenarioRiskVariant(scenario.risk_level)}>Riesgo {scenarioRiskLabel(scenario.risk_level)}</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{scenario.description}</p>
              <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <p className="text-xs font-medium text-[var(--text-muted)]">{scenarioImpactLabel(scenario)}</p>
                <p className="mt-1 text-xl font-semibold text-[var(--value)]">{formatScenarioEstimate(estimate)}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Horizonte: {scenario.time_horizon_days ? `${formatNumber(scenario.time_horizon_days, 0)} días` : "Sin dato"} · Confianza {formatNumber(scenario.confidence, 0)}%
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(scenario.parameters).slice(0, 4).map(([key, value]) => (
                  <Badge key={key} variant="neutral">
                    {scenarioParameterLabel(key)}: {scenarioParameterValue(key, value)}
                  </Badge>
                ))}
              </div>
              <ListBlock title="Supuestos" items={scenario.assumptions.slice(0, 3)} />
              <ListBlock title="Advertencias" items={scenario.warnings.slice(0, 3)} />
              <Button onClick={() => onUseScenario(scenario)} className="mt-4 w-full" variant={selected ? "primary" : "secondary"} size="sm">
                Usar este escenario
              </Button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function EconomicDriverTreeSection({ decision }: { decision: DecisionRecord }) {
  const tree = decision.economic_driver_tree;

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Árbol económico</p>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
            Lectura estructurada de las señales que justifican esta decisión. No implica causalidad confirmada.
          </p>
        </div>
        {tree ? <Badge variant="value">{tree.primary_driver.label}</Badge> : null}
      </div>

      {!tree ? (
        <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
          No hay árbol económico asociado a esta decisión.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Driver principal</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{tree.primary_driver.label}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{tree.primary_driver.explanation}</p>
              </div>
              <div className="shrink-0 sm:text-right">
                <p className="text-lg font-semibold text-[var(--value)]">
                  {economicDriverValue(tree.primary_driver.value, tree.primary_driver.unit)}
                </p>
                <p className="text-xs text-[var(--text-muted)]">{economicClassLabel(tree.primary_driver.economic_class)}</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">{tree.explanation_summary}</p>
          </div>

          {tree.branches.map((branch) => (
            <EconomicDriverBranchCard key={branch.key} branch={branch} decision={decision} />
          ))}

          <ListBlock title="Limitaciones de datos" items={tree.data_limitations} />
        </div>
      )}
    </section>
  );
}

function EconomicDriverBranchCard({ branch, decision }: { branch: EconomicDriverBranch; decision: DecisionRecord }) {
  const evidenceItems = branch.evidence_item_ids
    .map((id) => decision.evidence_items.find((item) => item.id === id))
    .filter((item): item is DecisionRecord["evidence_items"][number] => Boolean(item))
    .slice(0, 5);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral">{driverTypeLabel(branch.driver_type)}</Badge>
        <Badge variant="neutral">Severidad {severityLabel(branch.severity)}</Badge>
      </div>
      <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{branch.label}</p>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Señales observadas</p>
        <div className="mt-2 grid gap-2">
          {branch.signals.map((signal) => (
            <EconomicSignalRow key={signal.key} signal={signal} />
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Evidencia de producto</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{evidenceCountText(branch.evidence_item_ids.length)}</p>
        {evidenceItems.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {evidenceItems.map((item) => (
              <Badge key={item.id} variant="neutral">{evidenceProductLabel(item)}</Badge>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Sin evidencia de producto asociada.</p>
        )}
      </div>

      <ListBlock title="Hipótesis de causa" items={branch.hypotheses} />
    </div>
  );
}

function EconomicSignalRow({ signal }: { signal: EconomicDriverSignal }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{signal.label}</p>
            <Badge variant={signal.direction === "MISSING" ? "signal" : "neutral"}>{signalDirectionLabel(signal.direction)}</Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{signal.explanation}</p>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {economicDriverValue(signal.observed_value, signal.unit)}
          </p>
          {signal.threshold_value !== null ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Umbral: {economicDriverValue(signal.threshold_value, signal.unit)}
            </p>
          ) : null}
        </div>
      </div>

      {signal.product_refs.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {signal.product_refs.slice(0, 4).map((ref) => (
            <Badge key={ref.identity_key} variant="neutral">{ref.name || ref.sku || ref.identity_key}</Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{title}</p>
      <ul className="mt-2 space-y-1 text-sm leading-6 text-[var(--text-secondary)]">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
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
