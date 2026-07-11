"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, type TabId } from "@/components/layout";
import {
  Badge,
  Button,
  Card,
  DrawerShell,
  EmptyState,
  Metric,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import {
  DecisionCockpit,
  type ComparisonUnavailableReason,
} from "@/features/home/decision-cockpit";
import { analyzeBatchFiles, compareAnalysisSnapshots, inspectBatchFiles } from "@/lib/api";
import {
  getDecisionCenterMode,
  hydrateDecisions,
  isDemoId,
  loadDecisionStates,
  saveDecisionStates,
  updateDecisionState,
  type DecisionCenterMode,
} from "@/lib/decision-center";
import {
  DecisionCenterView,
  DecisionDetailDrawer,
  DEMO_DECISIONS,
} from "@/features/decisions/decision-center";
import { cn } from "@/lib/ui";
import type {
  AnalysisComparison,
  AnalysisSnapshot,
  AnalyzeResponse,
  BusinessProfile,
  DecisionLocalState,
  DecisionRecord,
  InspectBatchResponse,
  Recommendation,
  ScenarioSimulation,
  UploadRole,
} from "@/lib/types";

type WizardStep = 1 | 2 | 3 | 4 | 5;
type UploadMode = "combined" | "split";
type FileState = Partial<Record<UploadRole, File>>;

type HistoryItem = {
  id: string;
  analysisId?: string;
  createdAt: string;
  fileNames: string[];
  potential: number;
  economicAreaCount?: number;
  hasAggregateEconomicValue?: boolean;
  opportunities: number;
  score: number;
  mode?: string;
  mergeQuality?: number;
  reportSnapshot?: AnalyzeResponse;
};

type Toast = { type: "success" | "error" | "info"; message: string } | null;

type ProductRow = Record<string, string | number | null | undefined>;

const HISTORY_STORAGE_KEY = "businessgoal-history-final";

function canUseLocalStorage() {
  if (typeof window === "undefined") return false;

  try {
    return typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function removeStorageItem(key: string) {
  if (!canUseLocalStorage()) return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function readJsonStorage<T>(key: string, fallback: T, normalize: (value: unknown) => T | null): T {
  if (!canUseLocalStorage()) return fallback;

  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return fallback;

    const normalized = normalize(JSON.parse(stored));
    if (normalized === null) {
      removeStorageItem(key);
      return fallback;
    }

    return normalized;
  } catch {
    removeStorageItem(key);
    return fallback;
  }
}

function writeJsonStorage(key: string, value: unknown) {
  if (!canUseLocalStorage()) return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best effort only: persistence must never break the active render flow.
  }
}

function isHistoryItem(value: unknown): value is HistoryItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string"
    && typeof item.createdAt === "string"
    && Array.isArray(item.fileNames)
    && item.fileNames.every((fileName) => typeof fileName === "string")
    && typeof item.potential === "number"
    && typeof item.opportunities === "number"
    && typeof item.score === "number"
  );
}

function readHistoryStorage() {
  return readJsonStorage<HistoryItem[]>(HISTORY_STORAGE_KEY, [], (value) => {
    if (!Array.isArray(value)) return null;
    return value.filter(isHistoryItem);
  });
}

function writeHistoryStorage(history: HistoryItem[]) {
  writeJsonStorage(HISTORY_STORAGE_KEY, history.filter((item) => !isDemoId(item.id)));
}

const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  company_name: "Empresa demo",
  sector: "retail",
  analysis_goal: "balanced",
  target_margin_pct: 35,
  low_margin_pct: 20,
  max_coverage_days: 180,
  stockout_sensitivity: 0.15,
  min_sales_for_restock: 20,
  min_sales_for_margin_alert: 10,
};

const SECTOR_OPTIONS = [
  { value: "retail", label: "Retail / comercio" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "distribution", label: "Distribución" },
  { value: "manufacturing", label: "Fabricación" },
];

const ANALYSIS_GOAL_OPTIONS = [
  { value: "balanced", label: "Equilibrado" },
  { value: "cash", label: "Liberar caja" },
  { value: "margin", label: "Mejorar margen" },
  { value: "growth", label: "Evitar ventas perdidas" },
];

const DEMO_HISTORY_ITEMS: HistoryItem[] = [
  {
    id: "demo-2026-06-27",
    createdAt: "2026-06-27T09:35:00.000Z",
    fileNames: ["Inventario_Actual.csv", "Ventas_Mayo_2024.xlsx"],
    potential: 0,
    economicAreaCount: 3,
    hasAggregateEconomicValue: false,
    opportunities: 8,
    score: 82,
    mode: "Inventario + ventas",
    mergeQuality: 92,
  },
  {
    id: "demo-2026-06-20",
    createdAt: "2026-06-20T11:10:00.000Z",
    fileNames: ["Productos_Stock_2024.xlsx"],
    potential: 0,
    economicAreaCount: 3,
    hasAggregateEconomicValue: false,
    opportunities: 5,
    score: 78,
    mode: "Archivo combinado",
    mergeQuality: 86,
  },
];

const FALLBACK_RECOMMENDATIONS: Recommendation[] = [
  {
    type: "excess_stock",
    category: "cash_release",
    priority: "high",
    product: "Productos con exceso de stock",
    economic_impact: 18400,
    title: "Exceso de stock en 7 productos",
    what_happens: "Estos productos tienen rotación baja y alto coste de almacenamiento.",
    why_it_matters: "El capital inmovilizado reduce liquidez y capacidad de compra.",
    recommended_action: "Reducir stock objetivo y activar liquidación parcial.",
    confidence_level: 92,
    first_step: "Revisar los productos con mayor capital inmovilizado.",
    probable_cause: "Compras superiores a la demanda real o pedidos sin ajuste por rotación.",
    expected_benefit: "Liberación de caja y reducción de coste de almacenamiento.",
    timeframe: "7-14 días",
  },
  {
    type: "low_margin_high_sales",
    category: "margin_improvement",
    priority: "medium",
    product: "Productos con margen bajo",
    economic_impact: 6750,
    title: "Oportunidad de ajuste de precios",
    what_happens: "Puedes aumentar precios en productos sin impacto significativo en la demanda.",
    why_it_matters: "El volumen de ventas puede ocultar rentabilidad inferior a la esperada.",
    recommended_action: "Revisar precio mínimo rentable y aplicar subida selectiva.",
    confidence_level: 78,
    first_step: "Analizar productos con mayor venta y menor margen.",
    probable_cause: "Precios no actualizados frente a coste de compra o margen objetivo.",
    expected_benefit: "Mejora directa del margen sin aumentar volumen de ventas.",
    timeframe: "15-30 días",
  },
  {
    type: "stockout_risk",
    category: "sales_protection",
    priority: "low",
    product: "Productos con alta demanda",
    economic_impact: 4200,
    title: "Riesgo de rotura en productos A",
    what_happens: "Stock proyectado insuficiente en los próximos 15 días.",
    why_it_matters: "Si el producto se agota, puedes perder ventas de alta demanda.",
    recommended_action: "Reponer stock y definir punto mínimo de reposición.",
    confidence_level: 74,
    first_step: "Confirmar stock disponible y pedido pendiente.",
    probable_cause: "Punto de reposición no ajustado a la velocidad de ventas.",
    expected_benefit: "Evitar ventas perdidas y mantener disponibilidad.",
    timeframe: "Próximos 7 días",
  },
];

const PRODUCT_DEMO: ProductRow[] = [
  { product_name: "Auriculares Pro", category: "Electrónica", stock_turnover_90d: 0.3, stock_units_num: 256, inventory_value: 4250, impact: "Alto" },
  { product_name: "Silla Ejecutiva", category: "Mobiliario", stock_turnover_90d: 0.4, stock_units_num: 142, inventory_value: 2980, impact: "Alto" },
  { product_name: "Teclado Mecánico", category: "Electrónica", stock_turnover_90d: 0.6, stock_units_num: 198, inventory_value: 1870, impact: "Medio" },
  { product_name: "Monitor 24\"", category: "Electrónica", stock_turnover_90d: 1.2, stock_units_num: 64, inventory_value: 0, impact: "Bajo" },
];

function asNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function firstMetric(row: ProductRow, keys: string[]): number | null {
  for (const key of keys) {
    const numeric = optionalNumber(row[key]);
    if (numeric !== null) return numeric;
  }
  return null;
}

function formatOptionalCurrency(value: unknown, decimals = 0) {
  const numeric = optionalNumber(value);
  return numeric === null ? "—" : formatCurrency(numeric, decimals);
}

function formatOptionalNumber(value: unknown, decimals = 0, suffix = "") {
  const numeric = optionalNumber(value);
  return numeric === null ? "—" : `${formatNumber(numeric, decimals)}${suffix}`;
}

function formatCurrency(value?: number | string, decimals = 0) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(asNumber(value));
}

function formatNumber(value?: number | string, decimals = 0) {
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(asNumber(value));
}

function formatReportCurrencyText(text?: string) {
  if (!text) return "";

  return text.replace(
    /(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2})(?=\s*€)/g,
    (raw) => {
      const value = Number(raw.replace(/,/g, ""));
      return Number.isFinite(value) ? formatNumber(value) : raw;
    },
  );
}

function csvSafe(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function exportRowsToCsv(
  filename: string,
  columns: { header: string; value: (row: ProductRow) => string | number | null | undefined }[],
  rows: ProductRow[],
) {
  if (typeof window === "undefined") return;
  const header = columns.map((column) => csvSafe(column.header)).join(",");
  const body = rows.map((row) => columns.map((column) => csvSafe(column.value(row))).join(",")).join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportHistoryToCsv(history: HistoryItem[]) {
  if (typeof window === "undefined") return;
  const header = ["Fecha", "Archivos", "Lectura economica", "Decisiones", "Score", "Calidad"].map(csvSafe).join(",");
  const body = history.map((item) => [
    item.createdAt,
    item.fileNames.join(" + "),
    item.hasAggregateEconomicValue === false || item.economicAreaCount ? `${item.economicAreaCount || 0} áreas` : item.potential,
    item.opportunities,
    item.score,
    item.mergeQuality || "",
  ].map(csvSafe).join(",")).join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "businessgoal_historial_analisis.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function dateLabel(date: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
  } catch {
    return "Fecha no disponible";
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

function categoryLabel(category?: string) {
  const map: Record<string, string> = {
    cash_release: "Inventario",
    margin_improvement: "Precios",
    sales_protection: "Disponibilidad",
  };
  return map[category || ""] || "Negocio";
}

function economicImpactLabel(category?: string) {
  const map: Record<string, string> = {
    cash_release: "Caja liberable",
    margin_improvement: "Margen mejorable",
    sales_protection: "Margen expuesto",
  };
  return map[category || ""] || "Magnitud económica estimada";
}

function fileLabel(role: UploadRole | string) {
  if (role === "combined") return "Archivo combinado";
  if (role === "inventory") return "Inventario";
  return "Ventas";
}

function productIcon(index: number) {
  return String(index + 1).padStart(2, "0");
}

function getSummary(result: AnalyzeResponse | null) {
  const summary = result?.summary_kpis ?? {};
  const recs = result ? result.recommendations ?? [] : FALLBACK_RECOMMENDATIONS;
  const economicSummary = result?.economic_value_summary;
  const hasAggregateEconomicValue = economicSummary?.display_total_recommended_for_hero !== false;
  const totalImpact = result && hasAggregateEconomicValue
    ? asNumber(economicSummary?.display_total)
    : 0;
  return {
    potential: totalImpact,
    economicAreaCount: economicSummary?.category_count || 0,
    hasAggregateEconomicValue,
    opportunities: result ? recs.length : 8,
    loss: result ? asNumber(summary.cash_release_potential) : 12300,
    critical: result ? asNumber(summary.products_without_sales) + asNumber(summary.high_stock_low_sales_products) : 14,
    actions: result ? result.today_actions?.length ?? 0 : Math.min(5, recs.length || 5),
    capital: result ? asNumber(summary.cash_release_potential) : 27800,
    margin: result ? asNumber(summary.average_margin_pct) : 21.4,
    score: result ? asNumber(summary.business_score_current, 82) : 82,
    products: result ? asNumber(summary.products_count) : 0,
    inventoryValue: result ? asNumber(summary.total_inventory_value) : 0,
    grossProfit: result ? asNumber(summary.total_gross_profit_estimated) : 0,
  };
}

function realHistoryItems(history: HistoryItem[]) {
  return history
    .filter((item) => !isDemoId(item.id) && item.reportSnapshot?.analysis_snapshot)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function resolveComparisonBaseline(
  result: AnalyzeResponse | null,
  history: HistoryItem[],
): { baselineSnapshot: AnalysisSnapshot | null; reason: ComparisonUnavailableReason | null } {
  if (!result) return { baselineSnapshot: null, reason: "DEMO" };
  const candidateSnapshot = result.analysis_snapshot;
  if (!candidateSnapshot) return { baselineSnapshot: null, reason: "NO_SNAPSHOT" };

  const activeId = result.analysis_id;
  const realHistory = realHistoryItems(history);
  const activeIndex = realHistory.findIndex((item) => item.analysisId === activeId || item.id === activeId);

  if (activeIndex >= 0) {
    const previous = realHistory
      .slice(activeIndex + 1)
      .find((item) => item.reportSnapshot?.analysis_snapshot?.analysis_id !== activeId);

    if (previous?.reportSnapshot?.analysis_snapshot) {
      return { baselineSnapshot: previous.reportSnapshot.analysis_snapshot, reason: null };
    }

    return { baselineSnapshot: null, reason: "FIRST_ANALYSIS" };
  }

  const latestDifferent = realHistory.find((item) => item.reportSnapshot?.analysis_snapshot?.analysis_id !== activeId);
  if (latestDifferent?.reportSnapshot?.analysis_snapshot) {
    return { baselineSnapshot: latestDifferent.reportSnapshot.analysis_snapshot, reason: null };
  }

  return { baselineSnapshot: null, reason: "FIRST_ANALYSIS" };
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [uploadMode, setUploadMode] = useState<UploadMode>("split");
  const [files, setFiles] = useState<FileState>({});
  const [inspection, setInspection] = useState<InspectBatchResponse | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>(DEFAULT_BUSINESS_PROFILE);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [history, setHistory] = useState<HistoryItem[]>(DEMO_HISTORY_ITEMS);
  const [decisionStates, setDecisionStates] = useState<DecisionLocalState[]>([]);
  const [decisionStorageReady, setDecisionStorageReady] = useState(false);
  const [selectedDecision, setSelectedDecision] = useState<DecisionRecord | null>(null);
  const [selectedRecommendation, setSelectedRecommendation] = useState<Recommendation | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string>("recommended");
  const [comparison, setComparison] = useState<AnalysisComparison | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [comparisonUnavailableReason, setComparisonUnavailableReason] = useState<ComparisonUnavailableReason | null>("DEMO");
  const [query, setQuery] = useState("");
  const previousAnalysisIdRef = useRef<string | null>(null);

  useEffect(() => {
    const storedHistory = readHistoryStorage();

    if (storedHistory.length) {
      setHistory(
        [...storedHistory, ...DEMO_HISTORY_ITEMS].slice(0, 12),
      );

      const latestAnalysis = storedHistory.find(
        (item) => item.reportSnapshot,
      );

      if (latestAnalysis?.reportSnapshot) {
        setResult(latestAnalysis.reportSnapshot);

        const recommendedScenario =
          latestAnalysis.reportSnapshot.scenario_simulation
            ?.recommended_scenario;

        if (recommendedScenario) {
          setSelectedScenario(recommendedScenario);
        }
      }
    }
  }, []);

  useEffect(() => {
    setDecisionStates(loadDecisionStates());
    setDecisionStorageReady(true);
  }, []);

  useEffect(() => {
    if (!decisionStorageReady) return;
    saveDecisionStates(decisionStates);
  }, [decisionStorageReady, decisionStates]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    const candidateSnapshot = result?.analysis_snapshot;
    const { baselineSnapshot, reason } = resolveComparisonBaseline(result, history);

    setComparison(null);
    setComparisonError(null);
    setComparisonUnavailableReason(reason);

    if (!result || !candidateSnapshot || !baselineSnapshot) {
      setComparisonLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (baselineSnapshot.analysis_id === candidateSnapshot.analysis_id) {
      setComparisonLoading(false);
      setComparisonUnavailableReason("FIRST_ANALYSIS");
      return () => {
        cancelled = true;
      };
    }

    setComparisonLoading(true);
    compareAnalysisSnapshots(baselineSnapshot, candidateSnapshot)
      .then((response) => {
        if (cancelled) return;
        setComparison(response);
        setComparisonUnavailableReason(null);
      })
      .catch((exc) => {
        if (cancelled) return;
        setComparisonError(exc instanceof Error ? exc.message : "No se pudo comparar el análisis activo.");
      })
      .finally(() => {
        if (!cancelled) setComparisonLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [result, history]);

  const activeAnalysisId = result?.analysis_id ?? null;
  const decisionCenterMode = getDecisionCenterMode(result);
  const canonicalDecisions = useMemo(() => {
    if (decisionCenterMode === "DEMO") return DEMO_DECISIONS;
    if (decisionCenterMode === "ACTIVE_DECISIONS") return result?.decisions ?? [];
    return [];
  }, [decisionCenterMode, result]);
  const activeDecisions = useMemo(() => (
    hydrateDecisions(canonicalDecisions, decisionCenterMode === "DEMO" ? [] : decisionStates)
  ), [canonicalDecisions, decisionCenterMode, decisionStates]);

  useEffect(() => {
    if (previousAnalysisIdRef.current === activeAnalysisId) return;

    setSelectedRecommendation(null);
    setSelectedDecision((current) => (
      current?.source_analysis_id === activeAnalysisId ? current : null
    ));
    previousAnalysisIdRef.current = activeAnalysisId;
  }, [activeAnalysisId]);

  useEffect(() => {
    setSelectedDecision((current) => {
      if (!current) return null;
      return activeDecisions.find(
        (decision) => decision.id === current.id && decision.source_analysis_id === current.source_analysis_id,
      ) ?? null;
    });
  }, [activeDecisions]);

  const summary = useMemo(() => getSummary(result), [result]);
  const recommendations = result ? result.recommendations ?? [] : FALLBACK_RECOMMENDATIONS;
  const scenarios = result?.scenario_simulation;
  const products = result ? (result.products_preview as ProductRow[]) ?? [] : PRODUCT_DEMO;
  const filteredProducts = products.filter((p) => {
    if (!query.trim()) return true;
    return String(p.product_name || p.producto || p.sku || "").toLowerCase().includes(query.toLowerCase());
  });
  const currentFiles = useMemo(() => Object.entries(files).filter(([, file]) => Boolean(file)) as [UploadRole, File][], [files]);
  const activeHistory = result?.analysis_id
    ? history.find((item) => item.analysisId === result.analysis_id || item.id === result.analysis_id)
    : undefined;

  function showToast(type: Toast extends infer T ? T extends { type: infer U } ? U : never : never, message: string) {
    setToast({ type: type as "success" | "error" | "info", message });
  }

  function applyDecisionUpdate(
    decision: DecisionRecord,
    updates: Partial<Pick<DecisionLocalState, "status" | "selected_strategy" | "economic_target" | "target_date" | "user_note">>,
    toastMessage?: string,
  ) {
    if (isDemoId(decision.id)) {
      showToast("info", "La demo no guarda cambios locales.");
      return;
    }

    setDecisionStates((prev) => updateDecisionState(prev, decision, updates));
    if (toastMessage) showToast("success", toastMessage);
  }

  function setFile(role: UploadRole, file?: File) {
    setFiles((prev) => ({ ...prev, [role]: file }));
    setInspection(null);
    setWizardStep(2);
  }

  function resetWizard() {
    setFiles({});
    setInspection(null);
    setWizardStep(1);
    setError(null);
  }

  function openWizard() {
    resetWizard();
    setIsWizardOpen(true);
  }

  async function inspectCurrentFiles() {
    setError(null);
    setIsInspecting(true);
    try {
      const cleanFiles: FileState = uploadMode === "combined" ? { combined: files.combined } : { inventory: files.inventory, sales: files.sales };
      const response = await inspectBatchFiles(cleanFiles);
      setInspection(response);
      setWizardStep(3);
      showToast("success", "Archivos inspeccionados. Revisa el mapeo y la calidad de datos.");
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "No se pudieron inspeccionar los archivos.");
      showToast("error", "No se pudieron inspeccionar los archivos.");
    } finally {
      setIsInspecting(false);
    }
  }

  async function generateAnalysis() {
    setError(null);
    setIsAnalyzing(true);
    try {
      const cleanFiles: FileState = uploadMode === "combined" ? { combined: files.combined } : { inventory: files.inventory, sales: files.sales };
      const response = await analyzeBatchFiles(cleanFiles, undefined, businessProfile);
      setResult(response);
      setIsWizardOpen(false);
      setActiveTab("home");
      const item: HistoryItem = {
        id: response.analysis_id,
        analysisId: response.analysis_id,
        createdAt: response.analysis_created_at,
        fileNames: Object.values(cleanFiles).filter(Boolean).map((file) => file!.name),
        potential:
          response.economic_value_summary?.display_total_recommended_for_hero === false
            ? 0
            : asNumber(response.economic_value_summary?.display_total),
        economicAreaCount: response.economic_value_summary?.category_count || 0,
        hasAggregateEconomicValue: response.economic_value_summary?.display_total_recommended_for_hero !== false,
        opportunities: response.recommendations?.length || 0,
        score: asNumber(response.summary_kpis?.business_score_current, 82),
        mode: uploadMode === "combined" ? "Archivo combinado" : "Inventario + ventas",
        mergeQuality: asNumber(response.merge_summary?.merge_quality_score, response.file_validation?.quality_score || 0),
        reportSnapshot: response,
      };
      const nextHistory = [item, ...history.filter((h) => !isDemoId(h.id))].slice(0, 10);
      setHistory([...nextHistory, ...DEMO_HISTORY_ITEMS].slice(0, 12));
      writeHistoryStorage(nextHistory);
      showToast("success", "Análisis generado y guardado en historial.");
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "No se pudo generar el análisis.");
      showToast("error", "No se pudo generar el análisis.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  const uploadReady = uploadMode === "combined" ? Boolean(files.combined) : Boolean(files.inventory || files.sales);
  const analysisContext = result
    ? `${result.analysis_mode === "multi_file" ? "Inventario + ventas" : "Archivo combinado"} · ${result.business_profile?.sector_label || "Retail"} · ${result.business_profile?.analysis_goal_label || "Equilibrado"}`
    : "Demo activa · Financial Decision Intelligence · Datos de ejemplo";

  return (
    <>
      <AppShell
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenWizard={openWizard}
        analysisCreatedAt={result?.analysis_created_at}
        analysisContext={analysisContext}
        query={query}
        onQueryChange={setQuery}
      >
        {activeTab === "home" && (
          <DecisionCockpit
            result={result}
            recommendations={recommendations}
            decisionMode={decisionCenterMode}
            decisions={activeDecisions}
            comparison={comparison}
            comparisonLoading={comparisonLoading}
            comparisonError={comparisonError}
            comparisonUnavailableReason={comparisonUnavailableReason}
            onOpenWizard={openWizard}
            onSelectRecommendation={setSelectedRecommendation}
            onSelectDecision={setSelectedDecision}
            onGoToDecisions={() => setActiveTab("decisions")}
            onGoToAnalysis={() => setActiveTab("analysis")}
          />
        )}
        {activeTab === "analysis" && (
            <AnalysisView
              result={result}
              recommendations={recommendations}
              scenarios={scenarios}
              selectedScenario={selectedScenario}
              setSelectedScenario={setSelectedScenario}
              onOpenWizard={openWizard}
              setSelectedRecommendation={setSelectedRecommendation}
            />
          )}
        {activeTab === "decisions" && (
          <DecisionCenterView
            mode={decisionCenterMode}
            decisions={activeDecisions}
            result={result}
            onOpenWizard={openWizard}
            onSelectDecision={setSelectedDecision}
          />
        )}
        {activeTab === "scenarios" && <ScenariosView scenarios={scenarios} selectedScenario={selectedScenario} setSelectedScenario={setSelectedScenario} />}
        {activeTab === "data" && <DataView currentFiles={currentFiles} history={history} onOpenWizard={openWizard} />}
        {activeTab === "products" && <ProductCatalogTable products={filteredProducts} result={result} />}
        {activeTab === "inventory" && <InventorySalesView mode="inventory" result={result} products={filteredProducts} />}
        {activeTab === "sales" && <InventorySalesView mode="sales" result={result} products={filteredProducts} />}
        {activeTab === "reports" && <ExecutiveReport result={result} recommendations={recommendations} summary={summary} historyItem={activeHistory} />}
        {activeTab === "history" && <HistoryView history={history} setResult={setResult} setActiveTab={setActiveTab} />}
        {activeTab === "ai" && <AIContextView result={result} recommendations={recommendations} />}
        {activeTab === "settings" && <SettingsView businessProfile={businessProfile} setBusinessProfile={setBusinessProfile} />}
      </AppShell>

      {isWizardOpen && (
        <GuidedWizard
          wizardStep={wizardStep}
          setWizardStep={setWizardStep}
          uploadMode={uploadMode}
          setUploadMode={setUploadMode}
          files={files}
          setFile={setFile}
          inspection={inspection}
          isInspecting={isInspecting}
          isAnalyzing={isAnalyzing}
          uploadReady={uploadReady}
          error={error}
          businessProfile={businessProfile}
          setBusinessProfile={setBusinessProfile}
          onInspect={inspectCurrentFiles}
          onAnalyze={generateAnalysis}
          onClose={() => setIsWizardOpen(false)}
        />
      )}

      {selectedDecision && (
        <DecisionDetailDrawer
          decision={selectedDecision}
          onClose={() => setSelectedDecision(null)}
          onUpdate={applyDecisionUpdate}
        />
      )}
      {selectedRecommendation && <RecommendationDrawer recommendation={selectedRecommendation} onClose={() => setSelectedRecommendation(null)} />}
      {toast && <div className={cn("fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm font-semibold shadow-2xl", toast.type === "error" ? "border-[rgba(244,113,127,0.45)] bg-[rgba(48,18,24,0.96)] text-[var(--risk)]" : toast.type === "success" ? "border-[rgba(42,199,178,0.38)] bg-[rgba(13,44,41,0.96)] text-[var(--value)]" : "border-[rgba(91,115,242,0.4)] bg-[rgba(20,26,58,0.96)] text-[var(--primary-soft)]")}>{toast.message}</div>}
    </>
  );
}

function Kpi({ title, value, meta, icon, tone }: { title: string; value: string | number; meta: string; icon: string; tone: "blue" | "green" | "amber" | "red" }) {
  void icon;
  const tones = { blue: "primary", green: "value", amber: "signal", red: "risk" } as const;
  return <Metric label={title} value={value} supporting={meta} tone={tones[tone]} />;
}

function DecisionFeed({ recommendations, setSelectedRecommendation }: { recommendations: Recommendation[]; setSelectedRecommendation: (rec: Recommendation) => void }) {
  return (
    <Card>
      <div><h2 className="section-title">Decision Feed</h2><p className="text-sm text-[var(--text-secondary)]">Recomendaciones priorizadas por el modelo económico</p></div>
      <div className="mt-5 space-y-3">
        {recommendations.slice(0, 3).map((rec, index) => (
          <article key={`${rec.title}-${index}`} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 transition hover:border-[rgba(91,115,242,0.42)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap gap-2"><Badge className={priorityClass(rec.priority)}>{priorityLabel(rec.priority)}</Badge><Badge variant="primary">{categoryLabel(rec.category)}</Badge>{rec.confidence_level ? <Badge variant="neutral">{formatNumber(rec.confidence_level)}% confianza</Badge> : null}</div>
                <h3 className="mt-3 text-base font-semibold text-[var(--text-primary)]">{rec.title}</h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{rec.what_happens}</p>
                <p className="mt-2 text-sm font-semibold text-[var(--value)]">{economicImpactLabel(rec.category)} · {formatCurrency(rec.economic_impact)}</p>
              </div>
              <Button onClick={() => setSelectedRecommendation(rec)} className="shrink-0" variant="secondary" size="sm">Ver detalle</Button>
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

function ScenarioSimulator({ scenarios, selectedScenario, setSelectedScenario }: { scenarios?: ScenarioSimulation; selectedScenario: string; setSelectedScenario: (id: string) => void }) {
  if (!scenarios?.scenarios?.length) {
    return (
      <Card>
        <div className="flex items-start justify-between gap-4"><div><h2 className="section-title">Simulador de escenarios</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Genera un análisis para comparar escenarios prudente, recomendado e intensivo.</p></div><Badge variant="neutral">Disponible tras análisis</Badge></div>
      </Card>
    );
  }
  const selected = scenarios.scenarios.find((scenario) => scenario.id === selectedScenario) || scenarios.scenarios[0];
  return (
    <Card>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="section-title">Simulador de escenarios</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Estimación orientativa a 30 días. No representa una promesa de resultado.</p></div><div className="flex flex-wrap gap-2">{scenarios.scenarios.map((scenario) => <button key={scenario.id} onClick={() => setSelectedScenario(scenario.id)} className={cn("rounded-lg border px-3 py-2 text-xs font-semibold", selectedScenario === scenario.id ? "border-[rgba(91,115,242,0.48)] bg-[var(--selected)] text-[var(--text-primary)]" : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}>{scenario.label}</button>)}</div></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-5"><p className="text-sm font-medium text-[var(--text-secondary)]">Impacto estimado 30 días</p><p className="mt-3 text-4xl font-semibold text-[var(--value)]">{formatCurrency(selected.total_impact_30d)}</p><p className="mt-3 text-sm text-[var(--text-muted)]">Score tras escenario: <span className="font-semibold text-[var(--text-primary)]">{selected.score_after_scenario}/100</span> · Confianza {selected.confidence}%</p></div>
        <div className="grid gap-3 sm:grid-cols-3"><MiniScenario label="Caja liberada" value={selected.cash_released_30d} /><MiniScenario label="Mejora margen" value={selected.margin_gain_30d} /><MiniScenario label="Margen expuesto" value={selected.sales_protected_30d} /></div>
      </div>
      <ul className="mt-5 grid gap-2 text-sm text-[var(--text-secondary)] lg:grid-cols-2">{selected.assumptions.slice(0, 4).map((item) => <li key={item} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">{item}</li>)}</ul>
    </Card>
  );
}

function MiniScenario({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4"><p className="text-xs font-medium text-[var(--text-muted)]">{label}</p><p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{formatCurrency(value)}</p></div>;
}

function riskTone(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("alto") || normalized.includes("crítico")) return "border-[rgba(244,113,127,0.38)] bg-[rgba(244,113,127,0.12)] text-[var(--risk)]";
  if (normalized.includes("medio") || normalized.includes("revis")) return "border-[rgba(239,185,76,0.38)] bg-[rgba(239,185,76,0.12)] text-[var(--signal)]";
  return "border-[rgba(42,199,178,0.34)] bg-[rgba(42,199,178,0.12)] text-[var(--value)]";
}

function salesUnits(row: ProductRow) {
  return firstMetric(row, ["units_sold_num", "units_sold", "ventas_90d", "unidades_vendidas", "sales_units"]);
}

function productPrice(row: ProductRow) {
  return firstMetric(row, ["sale_price_num", "sale_price", "pvp", "precio"]);
}

function productCost(row: ProductRow) {
  return firstMetric(row, ["unit_cost_num", "unit_cost", "coste", "coste_medio"]);
}

function productMargin(row: ProductRow) {
  const existing = firstMetric(row, ["gross_margin_pct", "margen_bruto_pct", "margin_pct"]);
  if (existing !== null) return existing;
  const price = productPrice(row);
  const cost = productCost(row);
  return price !== null && cost !== null && price > 0 ? ((price - cost) / price) * 100 : null;
}

function productRevenue(row: ProductRow) {
  const existing = firstMetric(row, ["revenue", "total_revenue", "importe_ventas", "ingresos"]);
  if (existing !== null) return existing;
  const units = salesUnits(row);
  const price = productPrice(row);
  return units !== null && price !== null ? units * price : null;
}

function coverageDays(row: ProductRow) {
  return firstMetric(row, ["stock_coverage_days", "dias_cobertura", "coverage_days"]);
}

function ProductCatalogTable({ products, result }: { products: ProductRow[]; result: AnalyzeResponse | null }) {
  return (
    <div className="space-y-5">
      <Card>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Productos</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Catálogo, margen, categoría y estado económico por producto.</p>
      </Card>
      <Card>
        <div className="mb-4 flex items-center justify-between"><div><h2 className="section-title">Catálogo analizado</h2><p className="text-sm text-[var(--text-secondary)]">Visión de producto orientada a rentabilidad y decisión comercial.</p></div><Button onClick={() => exportRowsToCsv("businessgoal_productos.csv", [
            { header: "Producto", value: (row) => String(row.product_name || row.producto || "") },
            { header: "SKU", value: (row) => String(row.sku || "") },
            { header: "Categoría", value: (row) => String(row.category || row.categoria || "") },
            { header: "Proveedor", value: (row) => String(row.supplier || row.proveedor || "") },
            { header: "Coste", value: (row) => productCost(row) },
            { header: "Precio", value: (row) => productPrice(row) },
            { header: "Margen %", value: (row) => productMargin(row)?.toFixed(2) ?? "" },
            { header: "Unidades vendidas", value: (row) => salesUnits(row) },
          ], products)} variant="secondary" size="sm">Exportar CSV</Button></div>
        <div className="overflow-x-auto">
          <Table className="min-w-[880px]">
            <TableHead><TableRow><TableHeaderCell>Producto</TableHeaderCell><TableHeaderCell>SKU</TableHeaderCell><TableHeaderCell>Categoría</TableHeaderCell><TableHeaderCell className="text-right">Coste</TableHeaderCell><TableHeaderCell className="text-right">Precio</TableHeaderCell><TableHeaderCell className="text-right">Margen</TableHeaderCell><TableHeaderCell>Estado</TableHeaderCell><TableHeaderCell>Acción sugerida</TableHeaderCell></TableRow></TableHead>
            <TableBody>
              {products.slice(0, 18).map((p, index) => {
                const margin = productMargin(p);
                const coverage = coverageDays(p);
                const units = salesUnits(p);
                const status = margin !== null && margin < 20 ? "Margen bajo" : coverage !== null && coverage > 180 ? "Sobrestock" : units === 0 ? "Sin ventas" : "Correcto";
                const action = margin !== null && margin < 20 ? "Revisar precio" : coverage !== null && coverage > 180 ? "Reducir stock" : units === 0 ? "Liquidar" : "Mantener";
                return <TableRow key={`${p.product_name}-${index}`}><TableCell><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--surface-elevated)] text-xs font-semibold text-[var(--text-muted)]">{productIcon(index)}</span><div><p className="font-semibold text-[var(--text-primary)]">{String(p.product_name || p.producto || "Producto")}</p><p className="text-xs text-[var(--text-muted)]">{String(p.supplier || p.proveedor || "Proveedor no indicado")}</p></div></div></TableCell><TableCell>{String(p.sku || "-")}</TableCell><TableCell>{String(p.category || p.categoria || "Sin categoría")}</TableCell><TableCell numeric>{formatOptionalCurrency(productCost(p), 2)}</TableCell><TableCell numeric>{formatOptionalCurrency(productPrice(p), 2)}</TableCell><TableCell numeric className="font-semibold text-[var(--text-primary)]">{formatOptionalNumber(margin, 1, "%")}</TableCell><TableCell><Badge className={riskTone(status)}>{status}</Badge></TableCell><TableCell>{action}</TableCell></TableRow>;
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
      {!result ? <EmptyState title="Datos demo" text="Sube archivos para ver el catálogo con información real de tu negocio." /> : null}
    </div>
  );
}

function InventoryTable({ products, compact = false }: { products: ProductRow[]; compact?: boolean }) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between"><div><h2 className="section-title">Inventario detectado</h2><p className="text-sm text-[var(--text-secondary)]">Stock, cobertura, capital inmovilizado y acción operativa.</p></div><Button onClick={() => exportRowsToCsv("businessgoal_inventario.csv", [
          { header: "Producto", value: (row) => String(row.product_name || row.producto || row.sku || "") },
          { header: "SKU", value: (row) => String(row.sku || "") },
          { header: "Categoría", value: (row) => String(row.category || row.categoria || "") },
          { header: "Stock actual", value: (row) => firstMetric(row, ["stock_units_num", "stock"]) },
          { header: "Cobertura días", value: (row) => coverageDays(row)?.toFixed(0) ?? "" },
          { header: "Rotación 90d", value: (row) => firstMetric(row, ["stock_turnover_90d", "rotacion"])?.toFixed(2) ?? "" },
          { header: "Capital inmovilizado", value: (row) => firstMetric(row, ["inventory_value"]) },
          { header: "Unidades vendidas", value: (row) => salesUnits(row) },
        ], products)} variant="secondary" size="sm">Exportar CSV</Button></div>
      <div className="overflow-x-auto">
        <Table className="min-w-[780px]">
          <TableHead><TableRow><TableHeaderCell>Producto</TableHeaderCell><TableHeaderCell>Categoría</TableHeaderCell><TableHeaderCell className="text-right">Stock actual</TableHeaderCell><TableHeaderCell className="text-right">Cobertura</TableHeaderCell><TableHeaderCell className="text-right">Rotación</TableHeaderCell><TableHeaderCell className="text-right">Capital inmovilizado</TableHeaderCell><TableHeaderCell>Estado</TableHeaderCell></TableRow></TableHead>
          <TableBody>
            {products.slice(0, compact ? 5 : 16).map((p, index) => {
              const turnover = firstMetric(p, ["stock_turnover_90d", "rotacion"]);
              const coverage = coverageDays(p);
              const stock = firstMetric(p, ["stock_units_num", "stock"]);
              const units = salesUnits(p);
              const status = units === 0 && stock !== null && stock > 0 ? "Sin ventas" : (coverage !== null && coverage > 180) || (turnover !== null && turnover < 0.5) ? "Alto" : turnover !== null && turnover < 1 ? "Revisar" : "Correcto";
              return <TableRow key={`${p.product_name}-${index}`}><TableCell><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--surface-elevated)] text-xs font-semibold text-[var(--text-muted)]">{productIcon(index)}</span><div><p className="font-semibold text-[var(--text-primary)]">{String(p.product_name || p.producto || p.sku || "Producto")}</p><p className="text-xs text-[var(--text-muted)]">{String(p.sku || "SKU no disponible")}</p></div></div></TableCell><TableCell>{String(p.category || p.categoria || "Sin categoría")}</TableCell><TableCell numeric>{formatOptionalNumber(stock, 0, " uds")}</TableCell><TableCell numeric>{formatOptionalNumber(coverage, 0, " días")}</TableCell><TableCell numeric>{turnover === null ? "—" : <><span className={cn("mr-2 inline-block h-2 w-2 rounded-full", turnover < 0.5 ? "bg-[var(--risk)]" : turnover < 1 ? "bg-[var(--signal)]" : "bg-[var(--value)]")} />{formatNumber(turnover, 1)}x</>}</TableCell><TableCell numeric className="font-semibold text-[var(--text-primary)]">{formatOptionalCurrency(firstMetric(p, ["inventory_value"]))}</TableCell><TableCell><Badge className={riskTone(status)}>{status}</Badge></TableCell></TableRow>;
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function SalesTable({ products, result }: { products: ProductRow[]; result: AnalyzeResponse | null }) {
  return (
    <div className="space-y-5">
      <Card>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Ventas</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Demanda reciente, ingresos estimados, margen generado y exposición por disponibilidad.</p>
      </Card>
      <Card>
        <div className="mb-4 flex items-center justify-between"><div><h2 className="section-title">Rendimiento de ventas</h2><p className="text-sm text-[var(--text-secondary)]">Productos ordenados para detectar demanda, margen y riesgo de rotura.</p></div><Button onClick={() => exportRowsToCsv("businessgoal_ventas.csv", [
            { header: "Producto", value: (row) => String(row.product_name || row.producto || row.sku || "") },
            { header: "Categoría", value: (row) => String(row.category || row.categoria || "") },
            { header: "Unidades vendidas", value: (row) => salesUnits(row) },
            { header: "Ingresos estimados", value: (row) => productRevenue(row)?.toFixed(2) ?? "" },
            { header: "Margen generado", value: (row) => firstMetric(row, ["gross_profit_estimated", "beneficio_estimado"])?.toFixed(2) ?? "" },
            { header: "Stock actual", value: (row) => firstMetric(row, ["stock_units_num", "stock"]) },
            { header: "Riesgo de rotura", value: (row) => {
              const stock = firstMetric(row, ["stock_units_num", "stock"]);
              const units = salesUnits(row);
              return stock !== null && units !== null && stock <= Math.max(5, units * 0.15) ? "Alto" : "Normal";
            } },
          ], products)} variant="secondary" size="sm">Exportar CSV</Button></div>
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHead><TableRow><TableHeaderCell>Producto</TableHeaderCell><TableHeaderCell className="text-right">Unidades vendidas</TableHeaderCell><TableHeaderCell className="text-right">Ingresos estimados</TableHeaderCell><TableHeaderCell className="text-right">Margen generado</TableHeaderCell><TableHeaderCell className="text-right">Stock actual</TableHeaderCell><TableHeaderCell>Riesgo de rotura</TableHeaderCell><TableHeaderCell>Acción comercial</TableHeaderCell></TableRow></TableHead>
            <TableBody>
              {[...products].sort((a, b) => (salesUnits(b) ?? -1) - (salesUnits(a) ?? -1)).slice(0, 16).map((p, index) => {
                const units = salesUnits(p);
                const revenue = productRevenue(p);
                const price = productPrice(p);
                const cost = productCost(p);
                const explicitProfit = firstMetric(p, ["gross_profit_estimated", "beneficio_estimado"]);
                const profit = explicitProfit ?? (units !== null && price !== null && cost !== null ? units * Math.max(0, price - cost) : null);
                const stock = firstMetric(p, ["stock_units_num", "stock"]);
                const margin = productMargin(p);
                const risk = units !== null && stock !== null && units > 20 && stock < Math.max(8, units * 0.2) ? "Alto" : units !== null && stock !== null && units > 10 && stock < units * 0.4 ? "Medio" : "Bajo";
                const action = risk === "Alto" ? "Reponer prioritario" : margin !== null && margin < 20 && units !== null && units > 10 ? "Revisar precio" : "Mantener seguimiento";
                return <TableRow key={`${p.product_name}-${index}`}><TableCell><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--surface-elevated)] text-xs font-semibold text-[var(--text-muted)]">{productIcon(index)}</span><div><p className="font-semibold text-[var(--text-primary)]">{String(p.product_name || p.producto || p.sku || "Producto")}</p><p className="text-xs text-[var(--text-muted)]">{String(p.category || p.categoria || "Sin categoría")}</p></div></div></TableCell><TableCell numeric className="font-semibold text-[var(--text-primary)]">{formatOptionalNumber(units)}</TableCell><TableCell numeric>{formatOptionalCurrency(revenue)}</TableCell><TableCell numeric>{formatOptionalCurrency(profit)}</TableCell><TableCell numeric>{formatOptionalNumber(stock, 0, " uds")}</TableCell><TableCell><Badge className={riskTone(risk)}>{risk}</Badge></TableCell><TableCell>{action}</TableCell></TableRow>;
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
      {!result ? <EmptyState title="Datos demo" text="Sube archivos para ver ventas reales, demanda y riesgos de disponibilidad." /> : null}
    </div>
  );
}

function GuidedWizard(props: {
  wizardStep: WizardStep;
  setWizardStep: (step: WizardStep) => void;
  uploadMode: UploadMode;
  setUploadMode: (mode: UploadMode) => void;
  files: FileState;
  setFile: (role: UploadRole, file?: File) => void;
  inspection: InspectBatchResponse | null;
  isInspecting: boolean;
  isAnalyzing: boolean;
  uploadReady: boolean;
  error: string | null;
  businessProfile: BusinessProfile;
  setBusinessProfile: (profile: BusinessProfile) => void;
  onInspect: () => void;
  onAnalyze: () => void;
  onClose: () => void;
}) {
  const stepLabels = ["Tipo", "Archivos", "Columnas", "Negocio", "Confirmar"];
  const roles: UploadRole[] = props.uploadMode === "combined" ? ["combined"] : ["inventory", "sales"];
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[var(--border)] p-5"><div><h2 className="text-xl font-semibold text-[var(--text-primary)]">Nuevo análisis guiado</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Sube datos, valida columnas y genera decisiones económicas.</p></div><Button onClick={props.onClose} variant="secondary" size="sm">Cerrar</Button></div>
        <div className="flex gap-2 border-b border-[var(--border)] px-5 py-4">{stepLabels.map((label, index) => <button key={label} onClick={() => props.setWizardStep((index + 1) as WizardStep)} className={cn("flex-1 rounded-lg px-3 py-2 text-xs font-semibold", props.wizardStep === index + 1 ? "bg-[var(--selected)] text-[var(--text-primary)]" : index + 1 < props.wizardStep ? "bg-[rgba(42,199,178,0.12)] text-[var(--value)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]")}>{index + 1}. {label}</button>)}</div>
        <div className="max-h-[68vh] overflow-y-auto p-5">
          {props.error ? <div className="mb-4 rounded-lg border border-[rgba(244,113,127,0.42)] bg-[rgba(244,113,127,0.12)] p-4 text-sm font-semibold text-[var(--risk)]">{props.error}</div> : null}
          {props.wizardStep === 1 && <div className="grid gap-4 md:grid-cols-2"><ChoiceCard selected={props.uploadMode === "combined"} title="Tengo todo en un archivo" text="Productos, stock, costes, precios y ventas en un único Excel o CSV." onClick={() => props.setUploadMode("combined")} /><ChoiceCard selected={props.uploadMode === "split"} title="Tengo inventario y ventas separados" text="Cruza stock actual con ventas recientes para un análisis más realista." onClick={() => props.setUploadMode("split")} /></div>}
          {props.wizardStep === 2 && <div className="grid gap-4 md:grid-cols-2">{roles.map((role) => <UploadBox key={role} role={role} file={props.files[role]} setFile={props.setFile} />)}</div>}
          {props.wizardStep === 3 && <ValidationStep inspection={props.inspection} />}
          {props.wizardStep === 4 && <BusinessProfileForm businessProfile={props.businessProfile} setBusinessProfile={props.setBusinessProfile} />}
          {props.wizardStep === 5 && <ConfirmStep files={props.files} inspection={props.inspection} businessProfile={props.businessProfile} />}
        </div>
        <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-[var(--border)] bg-[var(--surface-1)]/95 p-5 backdrop-blur sm:flex-row sm:justify-between"><Button disabled={props.wizardStep === 1} onClick={() => props.setWizardStep(Math.max(1, props.wizardStep - 1) as WizardStep)} variant="secondary">Atrás</Button><div className="flex flex-wrap gap-3">{props.wizardStep === 2 && <Button disabled={!props.uploadReady || props.isInspecting} onClick={props.onInspect} variant="secondary">{props.isInspecting ? "Inspeccionando..." : "Inspeccionar archivos"}</Button>}{props.wizardStep < 5 && ![2,3,4].includes(props.wizardStep) && <Button onClick={() => props.setWizardStep(Math.min(5, props.wizardStep + 1) as WizardStep)} variant="secondary">Siguiente: Archivos</Button>}{props.wizardStep === 3 && <Button onClick={() => props.setWizardStep(4)} variant="primary">Siguiente: Negocio</Button>}{props.wizardStep === 4 && <Button onClick={() => props.setWizardStep(5)} variant="primary">Siguiente: Confirmar</Button>}{props.wizardStep === 5 && <Button disabled={!props.inspection?.analysis_ready || props.isAnalyzing} onClick={props.onAnalyze} variant="primary">{props.isAnalyzing ? "Generando..." : "Generar análisis"}</Button>}</div></div>
      </div>
    </div>
  );
}

function ChoiceCard({ selected, title, text, onClick }: { selected: boolean; title: string; text: string; onClick: () => void }) {
  return <button onClick={onClick} className={cn("rounded-lg border p-6 text-left transition", selected ? "border-[rgba(91,115,242,0.48)] bg-[var(--selected)]" : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]")}><p className="text-lg font-semibold text-[var(--text-primary)]">{title}</p><p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{text}</p></button>;
}

function UploadBox({ role, file, setFile }: { role: UploadRole; file?: File; setFile: (role: UploadRole, file?: File) => void }) {
  return <label className="block rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-6 transition hover:border-[var(--primary)]"><p className="text-lg font-semibold text-[var(--text-primary)]">{fileLabel(role)}</p><p className="mt-1 text-sm text-[var(--text-muted)]">CSV, XLSX o XLS</p><div className="mt-6 rounded-lg bg-[var(--surface-1)] p-5 text-center"><p className="text-sm font-semibold text-[var(--text-secondary)]">{file ? file.name : "Arrastra o selecciona un archivo"}</p></div><input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => setFile(role, event.target.files?.[0])} /></label>;
}

function ValidationStep({ inspection }: { inspection: InspectBatchResponse | null }) {
  if (!inspection) return <EmptyState title="Primero inspecciona los archivos" text="BusinessGoal revisará columnas, calidad de unión y vista previa antes de analizar." />;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Kpi title="Calidad de unión" value={`${inspection.merge_summary?.merge_quality_score || 0}%`} meta={inspection.merge_summary?.join_strategy || "Estrategia pendiente"} icon="" tone="green" />
        <Kpi title="Filas combinadas" value={inspection.rows_after_merge} meta="listas para analizar" icon="" tone="blue" />
        <Kpi title="Archivos usados" value={inspection.merge_summary?.files_count || 0} meta="fuentes de datos" icon="" tone="amber" />
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <h3 className="font-semibold text-[var(--text-primary)]">Columnas detectadas</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {inspection.merge_summary?.files?.map((file) => (
            <div key={`${file.role}-${file.file_name}`} className="rounded-lg border border-[var(--border)] p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{fileLabel(file.role)} · {file.file_name}</p>
              <p className="mt-2 text-xs text-[var(--text-muted)]">Calidad {file.quality_score}% · {file.quality_label}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(file.mapping || {}).filter(([, column]) => column).slice(0, 8).map(([field, column]) => <Badge key={field} variant="neutral">{field}: {column}</Badge>)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <h3 className="font-semibold text-[var(--text-primary)]">Vista previa</h3>
        <pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-[var(--surface-1)] p-4 text-xs text-[var(--text-secondary)]">{JSON.stringify(inspection.preview_rows?.slice(0, 4), null, 2)}</pre>
      </div>
    </div>
  );
}

function BusinessProfileForm({ businessProfile, setBusinessProfile }: { businessProfile: BusinessProfile; setBusinessProfile: (profile: BusinessProfile) => void }) {
  function update(key: keyof BusinessProfile, value: string | number) { setBusinessProfile({ ...businessProfile, [key]: value }); }
  const inputClass = "app-input w-full rounded-xl px-4 py-3 text-sm outline-none";
  return <div className="grid gap-4 md:grid-cols-2"><Field label="Nombre de empresa"><input value={businessProfile.company_name || ""} onChange={(e) => update("company_name", e.target.value)} className={inputClass} /></Field><Field label="Sector"><select value={businessProfile.sector} onChange={(e) => update("sector", e.target.value)} className={inputClass}>{SECTOR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="Objetivo del análisis"><select value={businessProfile.analysis_goal} onChange={(e) => update("analysis_goal", e.target.value)} className={inputClass}>{ANALYSIS_GOAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="Margen objetivo (%)"><input type="number" value={businessProfile.target_margin_pct} onChange={(e) => update("target_margin_pct", Number(e.target.value))} className={inputClass} /></Field><Field label="Margen bajo (%)"><input type="number" value={businessProfile.low_margin_pct} onChange={(e) => update("low_margin_pct", Number(e.target.value))} className={inputClass} /></Field><Field label="Cobertura máxima stock (días)"><input type="number" value={businessProfile.max_coverage_days} onChange={(e) => update("max_coverage_days", Number(e.target.value))} className={inputClass} /></Field></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">{label}</span>{children}</label>; }

function ConfirmStep({ files, inspection, businessProfile }: { files: FileState; inspection: InspectBatchResponse | null; businessProfile: BusinessProfile }) {
  const used = Object.entries(files).filter(([, f]) => Boolean(f)) as [UploadRole, File][];
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-5">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Resumen antes de generar</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {used.map(([role, file]) => <div key={role} className="rounded-lg bg-[var(--surface-1)] p-4"><p className="font-semibold text-[var(--text-primary)]">{fileLabel(role)}</p><p className="text-sm text-[var(--text-muted)]">{file.name}</p></div>)}
        </div>
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-5">
        <p className="font-semibold text-[var(--text-primary)]">Perfil aplicado</p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Sector: {businessProfile.sector} · Objetivo: {businessProfile.analysis_goal} · Margen objetivo: {businessProfile.target_margin_pct}%</p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">Calidad de unión: {inspection?.merge_summary?.merge_quality_score || 0}%</p>
      </div>
    </div>
  );
}

function AnalysisView({
  result,
  recommendations,
  scenarios,
  selectedScenario,
  setSelectedScenario,
  onOpenWizard,
  setSelectedRecommendation,
}: {
  result: AnalyzeResponse | null;
  recommendations: Recommendation[];
  scenarios?: ScenarioSimulation;
  selectedScenario: string;
  setSelectedScenario: (id: string) => void;
  onOpenWizard: () => void;
  setSelectedRecommendation: (rec: Recommendation) => void;
}) {
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Análisis</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Revisión técnica y económica del último análisis generado.
            </p>
          </div>

          <Button onClick={onOpenWizard} variant="primary">
            Nuevo análisis
          </Button>
        </div>
      </Card>

      <DecisionFeed
        recommendations={recommendations}
        setSelectedRecommendation={setSelectedRecommendation}
      />

      <ScenarioSimulator
        scenarios={scenarios}
        selectedScenario={selectedScenario}
        setSelectedScenario={setSelectedScenario}
      />

      {!result ? (
        <EmptyState
          title="Sin análisis real todavía"
          text="Estás viendo datos demo. Sube archivos para activar el motor de decisión con tus datos."
        />
      ) : null}
    </div>
  );
}

function ScenariosView({ scenarios, selectedScenario, setSelectedScenario }: { scenarios?: ScenarioSimulation; selectedScenario: string; setSelectedScenario: (id: string) => void }) {
  return (
    <div className="space-y-5">
      <Card>
        <p className="page-overline">Scenario Lab</p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">Escenarios</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
          Compara alternativas orientativas del análisis activo antes de decidir. Cada escenario muestra impacto estimado, confianza y supuestos utilizados.
        </p>
      </Card>
      <ScenarioSimulator scenarios={scenarios} selectedScenario={selectedScenario} setSelectedScenario={setSelectedScenario} />
    </div>
  );
}

function DataView({ currentFiles, history, onOpenWizard }: { currentFiles: [UploadRole, File][]; history: HistoryItem[]; onOpenWizard: () => void }) {
  const realHistory = history.filter((item) => !isDemoId(item.id));
  const latest = realHistory[0];
  const hasRealData = Boolean(latest || currentFiles.length);
  const connectedFiles = currentFiles.length
    ? currentFiles.map(([role, file]) => ({ role, name: file.name, date: "Sesión actual", quality: latest?.mergeQuality || 0 }))
    : latest?.fileNames.map((name, index) => ({ role: index === 0 ? "inventory" : "sales", name, date: dateLabel(latest.createdAt), quality: latest.mergeQuality || 0 })) || [];

  return (
    <div className="space-y-5">
      <Card><div className="flex items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold text-[var(--text-primary)]">Datos</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">Carga, validación y estado de procesamiento de las fuentes usadas por BusinessGoal.</p></div><Button onClick={onOpenWizard} variant="primary">Actualizar datos</Button></div></Card>
      <Card>
        <div className="mb-5 flex items-center justify-between"><div><h2 className="section-title">Estado de datos conectados</h2><p className="text-sm text-[var(--text-secondary)]">Último análisis real, calidad de unión y fuentes procesadas.</p></div><Badge variant={hasRealData ? "value" : "neutral"}>{hasRealData ? "Operativo" : "Demo"}</Badge></div>
        <div className="grid gap-4 md:grid-cols-3"><Kpi title="Calidad de datos" value={latest ? `${latest.mergeQuality || 0}%` : "—"} meta={latest ? "última inspección real" : "sin inspección real"} icon="" tone="green" /><Kpi title="Archivos usados" value={latest?.fileNames?.length || currentFiles.length || 0} meta={hasRealData ? "fuentes del análisis" : "sin fuentes reales"} icon="" tone="blue" /><Kpi title="Historial" value={realHistory.length} meta="análisis reales guardados" icon="" tone="amber" /></div>
        {connectedFiles.length ? <div className="mt-5 space-y-3">{connectedFiles.map((file) => <div key={`${file.role}-${file.name}`} className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 md:grid-cols-[1fr_auto_auto_auto]"><div><p className="font-semibold text-[var(--text-primary)]">{fileLabel(file.role)}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{file.name}</p></div><Badge variant="primary">{file.date}</Badge><Badge variant={file.quality ? "value" : "neutral"}>{file.quality ? `Calidad ${file.quality}%` : "Calidad pendiente"}</Badge><Button onClick={onOpenWizard} variant="secondary" size="sm">Reemplazar</Button></div>)}</div> : <div className="mt-5"><EmptyState title="Modo demo" text="Todavía no hay fuentes reales conectadas. Actualiza los datos para construir el modelo económico de tu negocio." action={<Button onClick={onOpenWizard} variant="primary" size="sm">Conectar datos</Button>} /></div>}
      </Card>
    </div>
  );
}

function AIContextView({ result, recommendations }: { result: AnalyzeResponse | null; recommendations: Recommendation[] }) {
  const topRecommendation = recommendations[0];
  return (
    <div className="space-y-5">
      <Card variant="elevated">
        <p className="page-overline">BusinessGoal IA</p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">Contexto inteligente</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
          BusinessGoal reúne aquí las explicaciones económicas más relevantes del análisis activo y las decisiones que requieren atención.
        </p>
      </Card>
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <h2 className="section-title">Insight disponible</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            {result?.executive_summary?.ai_insight || "Cuando generes un análisis, BusinessGoal mostrará aquí la explicación principal preparada por el motor económico."}
          </p>
        </Card>
        <Card>
          <h2 className="section-title">Próxima decisión contextual</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            {topRecommendation?.title || "Las decisiones aparecerán aquí cuando exista un análisis real con recomendaciones."}
          </p>
          {topRecommendation ? <Badge className="mt-4" variant="ai">{priorityLabel(topRecommendation.priority)}</Badge> : null}
        </Card>
      </div>
    </div>
  );
}

function InventorySalesView({ mode, result, products }: { mode: "inventory" | "sales"; result: AnalyzeResponse | null; products: ProductRow[] }) {
  if (mode === "sales") return <SalesTable products={products} result={result} />;
  return <div className="space-y-5"><Card><h1 className="text-2xl font-semibold text-[var(--text-primary)]">Inventario</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">Stock, cobertura, valor inmovilizado, rotación y estado operativo.</p></Card><InventoryTable products={products} />{!result ? <EmptyState title="Datos demo" text="Sube archivos para ver esta sección con información real de tu negocio." /> : null}</div>;
}


function ExecutiveReport({ result, recommendations, summary, historyItem }: { result: AnalyzeResponse | null; recommendations: Recommendation[]; summary: ReturnType<typeof getSummary>; historyItem?: HistoryItem }) {
  const topRecommendations = recommendations.slice(0, 3);

  const riskRecommendations = recommendations
    .filter(
      (rec) =>
        rec.priority === "high" ||
        rec.category === "sales_protection" ||
        String(rec.type || "").toLowerCase().includes("risk"),
    )
    .slice(0, 3);

  const prioritizedRisks = riskRecommendations.length
    ? riskRecommendations
    : topRecommendations;

  const trustComponents = result?.economic_value_summary?.categories?.length
    ? result.economic_value_summary.categories.map((category) => ({
        key: category.key,
        label: category.label,
        amount: category.value,
        description: category.description,
      }))
    : result?.trust_layer?.components || [
        { key: "cash", label: "Caja liberable", amount: summary.capital, description: "Capital inmovilizado en inventario con baja rotación." },
        { key: "margin", label: "Margen mejorable", amount: 6750, description: "Potencial estimado por revisión selectiva de precio y coste." },
        { key: "risk", label: "Margen expuesto", amount: 4200, description: "Margen bruto asociado a productos con demanda y riesgo de rotura." },
      ];

  const executiveMessage = formatReportCurrencyText(
    result?.executive_summary?.message ||
      "BusinessGoal ha detectado oportunidades de caja, margen y disponibilidad. La prioridad es actuar primero sobre capital inmovilizado y productos con riesgo económico directo.",
  );

  const aiInsight = formatReportCurrencyText(
    result?.executive_summary?.ai_insight ||
      "La primera decisión recomendada es reducir exceso de stock en productos con baja rotación.",
  );

  return (
    <div className="executive-report-print mx-auto max-w-6xl">
      <div className="report-page space-y-5">
        <section className="report-card report-keep rounded-[28px] border border-slate-800 bg-white p-8 text-slate-950 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.22em] text-blue-700">BusinessGoal · Informe ejecutivo</p>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">Diagnóstico económico del negocio</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">Informe preparado para dirección con oportunidades económicas, riesgos prioritarios y plan de acción recomendado.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p><span className="font-bold">Fecha:</span> {historyItem ? dateLabel(historyItem.createdAt) : "Demo"}</p>
              <p className="mt-1"><span className="font-bold">Lectura:</span> 3 minutos</p>
              <p className="mt-1"><span className="font-bold">Confianza:</span> {result?.trust_layer?.confidence_level || 86}%</p>
            </div>
          </div>

          <button onClick={() => window.print()} className="no-print mt-6 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white">Generar PDF ejecutivo</button>
          <p className="no-print mt-3 text-xs leading-5 text-slate-500">En Chrome, abre “Más ajustes” y desactiva “Encabezados y pies de página” para eliminar la URL y la numeración añadidas por el navegador.</p>
        </section>

        <div className="report-metrics-grid grid gap-5 md:grid-cols-4">
          <ReportMetric label={summary.hasAggregateEconomicValue ? "Valor económico" : "Áreas económicas"} value={summary.hasAggregateEconomicValue ? formatCurrency(summary.potential) : `${summary.economicAreaCount} áreas`} tone="green" />
          <ReportMetric label="Capital inmovilizado" value={formatCurrency(summary.capital)} tone="red" />
          <ReportMetric label="Business Score" value={`${summary.score}/100`} tone="blue" />
          <ReportMetric label="Acciones recomendadas" value={summary.actions} tone="amber" />
        </div>

        <section className="report-card report-keep rounded-[28px] border border-slate-800 bg-white p-7 text-slate-950">
          <h2 className="text-2xl font-black">Resumen ejecutivo</h2>
          <p className="mt-4 max-w-5xl text-base leading-8 text-slate-700">{executiveMessage}</p>
          <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-5 text-sm leading-7 text-violet-950"><span className="font-black">BusinessGoal IA: </span>{aiInsight}</div>
        </section>
      </div>

      <div className="report-page space-y-5">
        <section className="report-card report-keep rounded-[28px] border border-slate-800 bg-white p-7 text-slate-950">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">Cómo se calcula el valor económico</h2>
              <p className="mt-2 text-sm text-slate-600">Desglose orientativo para diferenciar caja, margen mejorable y margen expuesto. No es una promesa de resultado.</p>
            </div>
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">{result?.trust_layer?.confidence_level || 86}% confianza</Badge>
          </div>

          <div className="report-three-grid mt-6 grid gap-4 md:grid-cols-3">
            {trustComponents.slice(0, 3).map((component) => (
              <div key={component.key} className="report-keep rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-600">{component.label}</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{formatCurrency(component.amount)}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{component.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="report-card rounded-[28px] border border-slate-800 bg-white p-7 text-slate-950">
          <h2 className="text-2xl font-black">Top decisiones recomendadas</h2>
          <div className="report-decision-list mt-5 space-y-4">
            {topRecommendations.map((rec, index) => (
              <div key={`${rec.title}-${index}`} className="report-keep rounded-2xl border border-slate-200 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">{priorityLabel(rec.priority)} · {categoryLabel(rec.category)}</p>
                    <h3 className="mt-2 text-lg font-black text-slate-950">{rec.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{rec.recommended_action}</p>
                  </div>
                  <div className="shrink-0 text-right"><p className="text-xs font-bold text-slate-500">{economicImpactLabel(rec.category)}</p><p className="mt-1 text-xl font-black text-emerald-600">{formatCurrency(rec.economic_impact)}</p></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="report-page space-y-5">
        <section className="report-card report-keep rounded-[28px] border border-slate-800 bg-white p-7 text-slate-950">
          <h2 className="text-2xl font-black">Riesgos prioritarios</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Exposiciones económicas que requieren seguimiento o intervención para evitar pérdida de liquidez, margen o ventas.</p>

          <div className="report-three-grid mt-5 grid gap-4 md:grid-cols-3">
            {prioritizedRisks.map((rec, index) => (
              <div key={`risk-${rec.title}-${index}`} className="report-keep rounded-2xl border border-red-100 bg-red-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-red-700">{priorityLabel(rec.priority)} · {categoryLabel(rec.category)}</p>
                <h3 className="mt-2 text-base font-black text-slate-950">{rec.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{rec.what_happens || rec.why_it_matters || rec.recommended_action}</p>
                <p className="mt-3 text-sm font-black text-red-700">Exposición estimada: {formatCurrency(rec.economic_impact)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="report-card report-keep rounded-[28px] border border-slate-800 bg-white p-7 text-slate-950">
          <h2 className="text-2xl font-black">Plan de acción recomendado</h2>
          <div className="report-three-grid mt-5 grid gap-4 md:grid-cols-3">
            <ActionPeriod title="Hoy" items={["Revisar top productos inmovilizados", "Confirmar compras pendientes", "Validar precios críticos"]} light />
            <ActionPeriod title="Esta semana" items={["Lanzar liquidación parcial", "Ajustar precios selectivos", "Reponer productos de alta demanda"]} light />
            <ActionPeriod title="Este mes" items={["Redefinir stock objetivo", "Negociar costes", "Revisar política de margen"]} light />
          </div>
        </section>

        <section className="report-card report-keep rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-slate-700">
          <p className="text-sm font-black text-slate-950">Nota metodológica</p>
          <p className="mt-2 text-xs leading-5">Las cifras mostradas son estimaciones orientativas calculadas a partir de los datos analizados. Caja liberable, margen mejorable y margen expuesto representan categorías económicas distintas, no son aditivas y no constituyen una promesa de resultado.</p>
        </section>
      </div>
    </div>
  );
}

function ReportMetric({ label, value, tone }: { label: string; value: string | number; tone: "green" | "red" | "blue" | "amber" }) {
  const tones = { green: "text-emerald-700", red: "text-red-700", blue: "text-blue-700", amber: "text-amber-700" };
  return <section className="report-card rounded-[24px] border border-slate-800 bg-white p-5 text-slate-950"><p className="text-sm font-bold text-slate-500">{label}</p><p className={cn("mt-3 text-2xl font-black", tones[tone])}>{value}</p></section>;
}

function ActionPeriod({ title, items, light = false }: { title: string; items: string[]; light?: boolean }) { return <div className={cn("rounded-2xl border p-4", light ? "border-slate-200 bg-slate-50" : "border-slate-800 bg-black/20")}><p className={cn("font-black", light ? "text-slate-950" : "text-white")}>{title}</p><ul className={cn("mt-3 space-y-2 text-sm", light ? "text-slate-700" : "text-slate-400")}>{items.map((item) => <li key={item}>• {item}</li>)}</ul></div>; }

function HistoryView({ history, setResult, setActiveTab }: { history: HistoryItem[]; setResult: (value: AnalyzeResponse | null) => void; setActiveTab: (tab: TabId) => void }) {
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Historial de análisis</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Análisis guardados localmente durante la demo.</p>
          </div>
          <Button onClick={() => exportHistoryToCsv(history)} variant="secondary" size="sm">Exportar historial CSV</Button>
        </div>
      </Card>
      <Card>
        <div className="overflow-x-auto">
          <Table className="min-w-[820px]">
            <TableHead><TableRow><TableHeaderCell>Fecha</TableHeaderCell><TableHeaderCell>Archivos</TableHeaderCell><TableHeaderCell className="text-right">Lectura económica</TableHeaderCell><TableHeaderCell className="text-right">Oportunidades</TableHeaderCell><TableHeaderCell className="text-right">Score</TableHeaderCell><TableHeaderCell className="text-right">Calidad</TableHeaderCell><TableHeaderCell>Acción</TableHeaderCell></TableRow></TableHead>
            <TableBody>
              {history.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{dateLabel(item.createdAt)}</TableCell>
                  <TableCell>{item.fileNames.join(" + ")}</TableCell>
                  <TableCell numeric className="font-semibold text-[var(--value)]">{item.hasAggregateEconomicValue === false || item.economicAreaCount ? `${item.economicAreaCount || 0} áreas` : formatCurrency(item.potential)}</TableCell>
                  <TableCell numeric>{item.opportunities}</TableCell>
                  <TableCell numeric>{item.score}/100</TableCell>
                  <TableCell numeric>{item.mergeQuality || "-"}%</TableCell>
                  <TableCell><Button onClick={() => { if (item.reportSnapshot) setResult(item.reportSnapshot); setActiveTab("reports"); }} variant="secondary" size="sm">Ver informe</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function SettingsView({ businessProfile, setBusinessProfile }: { businessProfile: BusinessProfile; setBusinessProfile: (profile: BusinessProfile) => void }) { return <div className="space-y-5"><Card><h1 className="text-2xl font-semibold text-[var(--text-primary)]">Configuración</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">Perfil de negocio usado por defecto en los análisis.</p></Card><Card><BusinessProfileForm businessProfile={businessProfile} setBusinessProfile={setBusinessProfile} /></Card></div>; }

function RecommendationDrawer({ recommendation, onClose }: { recommendation: Recommendation; onClose: () => void }) {
  return (
    <DrawerShell
      title={recommendation.title}
      onClose={onClose}
      eyebrow={<Badge className={priorityClass(recommendation.priority)}>{priorityLabel(recommendation.priority)}</Badge>}
    >
      <p className="mt-2 text-sm font-medium text-[var(--text-muted)]">{economicImpactLabel(recommendation.category)}</p>
      <p className="mt-1 text-3xl font-semibold text-[var(--value)]">{formatCurrency(recommendation.economic_impact)}</p>
      <div className="mt-6 space-y-4">
        {[
          { title: "Qué ocurre", text: recommendation.what_happens },
          { title: "Causa probable", text: recommendation.probable_cause },
          { title: "Por qué importa", text: recommendation.why_it_matters },
          { title: "Primer paso", text: recommendation.first_step },
          { title: "Acción recomendada", text: recommendation.recommended_action },
          { title: "Beneficio esperado", text: recommendation.expected_benefit },
          { title: "Horizonte", text: recommendation.timeframe },
        ].filter((item) => item.text).map((item) => (
          <div key={item.title} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{item.text}</p>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}
