"use client";

import { useEffect, useMemo, useState } from "react";
import { analyzeBatchFiles, inspectBatchFiles } from "@/lib/api";
import type {
  AnalyzeResponse,
  BusinessProfile,
  InspectBatchResponse,
  Recommendation,
  ScenarioSimulation,
  UploadRole,
} from "@/lib/types";

type TabId =
  | "dashboard"
  | "analysis"
  | "opportunities"
  | "files"
  | "products"
  | "inventory"
  | "sales"
  | "reports"
  | "history"
  | "settings";

type WizardStep = 1 | 2 | 3 | 4 | 5;
type UploadMode = "combined" | "split";
type FileState = Partial<Record<UploadRole, File>>;

type HistoryItem = {
  id: string;
  analysisId?: string;
  createdAt: string;
  fileNames: string[];
  potential: number;
  opportunities: number;
  score: number;
  scoreAfter?: number;
  mode?: string;
  mergeQuality?: number;
  reportSnapshot?: AnalyzeResponse;
};

type Toast = { type: "success" | "error" | "info"; message: string } | null;

type ProductRow = Record<string, string | number | undefined>;

const NAV: { id: TabId; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "analysis", label: "Análisis", icon: "⌁" },
  { id: "opportunities", label: "Oportunidades", icon: "◎" },
  { id: "files", label: "Archivos", icon: "□" },
  { id: "products", label: "Productos", icon: "⬡" },
  { id: "inventory", label: "Inventario", icon: "▤" },
  { id: "sales", label: "Ventas", icon: "☿" },
  { id: "reports", label: "Informes", icon: "▧" },
  { id: "history", label: "Historial", icon: "◷" },
  { id: "settings", label: "Configuración", icon: "⚙" },
];

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
    potential: 32470,
    opportunities: 8,
    score: 82,
    scoreAfter: 91,
    mode: "Inventario + ventas",
    mergeQuality: 92,
  },
  {
    id: "demo-2026-06-20",
    createdAt: "2026-06-20T11:10:00.000Z",
    fileNames: ["Productos_Stock_2024.xlsx"],
    potential: 21800,
    opportunities: 5,
    score: 78,
    scoreAfter: 86,
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
    suggested_owner: "Responsable de compras / operaciones",
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
    suggested_owner: "Dirección comercial",
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
    suggested_owner: "Operaciones / compras",
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
  columns: { header: string; value: (row: ProductRow) => string | number | undefined }[],
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
  const header = ["Fecha", "Archivos", "Valor economico", "Oportunidades", "Score", "Calidad"].map(csvSafe).join(",");
  const body = history.map((item) => [
    item.createdAt,
    item.fileNames.join(" + "),
    item.potential,
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
  if (priority === "high") return "border-red-400/30 bg-red-500/15 text-red-200";
  if (priority === "medium") return "border-amber-400/30 bg-amber-500/15 text-amber-200";
  return "border-cyan-400/30 bg-cyan-500/15 text-cyan-200";
}

function categoryLabel(category?: string) {
  const map: Record<string, string> = {
    cash_release: "Inventario",
    margin_improvement: "Precios",
    sales_protection: "Ventas",
  };
  return map[category || ""] || "Negocio";
}

function fileLabel(role: UploadRole | string) {
  if (role === "combined") return "Archivo combinado";
  if (role === "inventory") return "Inventario";
  return "Ventas";
}

function productIcon(index: number) {
  const icons = ["🎧", "🪑", "⌨️", "🖥️", "🔊", "📦", "🛠️", "💡"];
  return icons[index % icons.length];
}

function getSummary(result: AnalyzeResponse | null) {
  const summary = result?.summary_kpis ?? {};
  const recs = result?.recommendations?.length ? result.recommendations : FALLBACK_RECOMMENDATIONS;
  const totalImpact =
    asNumber(result?.economic_value_summary?.display_total) ||
    asNumber(summary.potential_recoverable_benefit) ||
    recs.reduce((sum, rec) => sum + asNumber(rec.economic_impact), 0);
  return {
    potential: result ? totalImpact : 32470,
    opportunities: result ? recs.length : 8,
    loss: result ? asNumber(summary.cash_release_potential) : 12300,
    critical: result ? asNumber(summary.products_without_sales) + asNumber(summary.high_stock_low_sales_products) : 14,
    actions: result?.today_actions?.length || Math.min(5, recs.length || 5),
    capital: result ? asNumber(summary.cash_release_potential) : 27800,
    margin: result ? asNumber(summary.average_margin_pct) : 21.4,
    score: result ? asNumber(summary.business_score_current, 82) : 82,
    scoreAfter: result ? asNumber(summary.business_score_after_actions, 91) : 91,
    products: result ? asNumber(summary.products_count) : 0,
    inventoryValue: result ? asNumber(summary.total_inventory_value) : 0,
    grossProfit: result ? asNumber(summary.total_gross_profit_estimated) : 0,
  };
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Sparkline() {
  return (
    <svg viewBox="0 0 260 120" className="h-[115px] w-full max-w-[280px] overflow-visible">
      <defs>
        <linearGradient id="lineGlow" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="45%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
        <linearGradient id="areaGlow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
        </linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="4" result="coloredBlur" /><feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <path d="M8 105 C38 92,43 50,68 62 C90 73,92 35,114 44 C136 54,141 15,166 26 C190 37,192 54,214 33 C230 18,242 7,252 0 L252 120 L8 120 Z" fill="url(#areaGlow)" />
      <path d="M8 105 C38 92,43 50,68 62 C90 73,92 35,114 44 C136 54,141 15,166 26 C190 37,192 54,214 33 C230 18,242 7,252 0" fill="none" stroke="url(#lineGlow)" strokeWidth="4" strokeLinecap="round" filter="url(#glow)" />
      <circle cx="252" cy="0" r="6" fill="#60A5FA" filter="url(#glow)" />
    </svg>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("neon-card rounded-[26px] p-5", className)}>{children}</section>;
}

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold", className)}>{children}</span>;
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/35 p-8 text-center">
      <p className="text-base font-bold text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">{text}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
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
  const [selectedRecommendation, setSelectedRecommendation] = useState<Recommendation | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string>("recommended");
  const [query, setQuery] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("businessgoal-history-final");

      if (stored) {
        const storedHistory = JSON.parse(stored) as HistoryItem[];

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
    } catch {
      // ignore localStorage issues
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const summary = useMemo(() => getSummary(result), [result]);
  const recommendations = result?.recommendations?.length ? result.recommendations : FALLBACK_RECOMMENDATIONS;
  const scenarios = result?.scenario_simulation;
  const products = result?.products_preview?.length ? (result.products_preview as ProductRow[]) : PRODUCT_DEMO;
  const filteredProducts = products.filter((p) => {
    if (!query.trim()) return true;
    return String(p.product_name || p.producto || p.sku || "").toLowerCase().includes(query.toLowerCase());
  });
  const currentFiles = useMemo(() => Object.entries(files).filter(([, file]) => Boolean(file)) as [UploadRole, File][], [files]);
  const activeHistory = history[0];

  function showToast(type: Toast extends infer T ? T extends { type: infer U } ? U : never : never, message: string) {
    setToast({ type: type as "success" | "error" | "info", message });
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
      setActiveTab("dashboard");
      const item: HistoryItem = {
        id: response.analysis_id,
        analysisId: response.analysis_id,
        createdAt: response.analysis_created_at,
        fileNames: Object.values(cleanFiles).filter(Boolean).map((file) => file!.name),
        potential: asNumber(response.economic_value_summary?.display_total, asNumber(response.summary_kpis?.potential_recoverable_benefit)),
        opportunities: response.recommendations?.length || 0,
        score: asNumber(response.summary_kpis?.business_score_current, 82),
        scoreAfter: asNumber(response.summary_kpis?.business_score_after_actions, 91),
        mode: uploadMode === "combined" ? "Archivo combinado" : "Inventario + ventas",
        mergeQuality: asNumber(response.merge_summary?.merge_quality_score, response.file_validation?.quality_score || 0),
        reportSnapshot: response,
      };
      const nextHistory = [item, ...history.filter((h) => !h.id.startsWith("demo"))].slice(0, 10);
      setHistory([...nextHistory, ...DEMO_HISTORY_ITEMS].slice(0, 12));
      localStorage.setItem("businessgoal-history-final", JSON.stringify(nextHistory));
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
    ? `${result.analysis_mode === "multi_file" ? "Inventario + ventas" : "Archivo combinado"} · ${result.business_profile?.sector_label || "Retail"} · ${result.business_profile?.analysis_goal_label || "Equilibrado"} · Generado ahora`
    : "Demo activa · Financial Decision Intelligence · Datos de ejemplo";

  return (
    <div className="relative min-h-screen overflow-x-hidden text-slate-100">
      <aside className="app-sidebar fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-slate-800/80 bg-black/45 p-5 backdrop-blur-xl xl:flex">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20">◆</div>
          <div>
            <p className="text-lg font-black tracking-tight text-white">BusinessGoal</p>
            <p className="text-xs text-slate-500">Decision Intelligence</p>
          </div>
        </div>
        <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 pb-4">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-semibold transition",
                activeTab === item.id
                  ? "border border-blue-400/40 bg-blue-600/80 text-white shadow-lg shadow-blue-500/20"
                  : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
              )}
            >
              <span className="w-6 text-lg">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-4 shrink-0 rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-sm font-bold text-white">¿Necesitas ayuda?</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">Guía rápida para configurar tus datos.</p>
          <button onClick={() => setActiveTab("settings")} className="mt-4 h-10 w-full rounded-xl border border-slate-700 text-sm font-bold text-white hover:bg-white/5">Ver configuración</button>
        </div>
      </aside>

      <main className="relative z-10 min-h-screen xl:pl-[260px]">
        <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
          <header className="app-header mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-2xl font-black tracking-tight text-white sm:text-3xl">Panel ejecutivo</p>
              <p className="mt-1 text-sm text-slate-400">Hoy hemos detectado {summary.opportunities} oportunidades de mejora.</p>
              <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="truncate">Análisis actual: {analysisContext}</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex h-11 min-w-[260px] items-center gap-3 rounded-2xl border border-slate-800 bg-black/30 px-4 text-sm text-slate-400">
                <span>⌕</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto..." className="w-full bg-transparent outline-none placeholder:text-slate-600" />
                <span className="text-xs">⌘K</span>
              </label>
              <button onClick={() => { resetWizard(); setIsWizardOpen(true); }} className="h-11 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500">+ Subir nuevo análisis</button>
              <button className="hidden h-11 w-11 rounded-2xl border border-slate-800 bg-black/25 text-lg text-white sm:block">♢</button>
            </div>
          </header>

          {activeTab === "dashboard" && <DashboardView summary={summary} result={result} recommendations={recommendations} scenarios={scenarios} selectedScenario={selectedScenario} setSelectedScenario={setSelectedScenario} setSelectedRecommendation={setSelectedRecommendation} setActiveTab={setActiveTab} history={history} currentFiles={currentFiles} products={filteredProducts} />}
          {activeTab === "analysis" && (
            <AnalysisView
              result={result}
              recommendations={recommendations}
              scenarios={scenarios}
              selectedScenario={selectedScenario}
              setSelectedScenario={setSelectedScenario}
              setIsWizardOpen={setIsWizardOpen}
              setSelectedRecommendation={setSelectedRecommendation}
            />
          )}
          {activeTab === "opportunities" && <OpportunitiesView recommendations={recommendations} setSelectedRecommendation={setSelectedRecommendation} />}
          {activeTab === "files" && <FilesView currentFiles={currentFiles} history={history} setIsWizardOpen={setIsWizardOpen} />}
          {activeTab === "products" && <ProductCatalogTable products={filteredProducts} result={result} />}
          {activeTab === "inventory" && <InventorySalesView mode="inventory" result={result} products={filteredProducts} />}
          {activeTab === "sales" && <InventorySalesView mode="sales" result={result} products={filteredProducts} />}
          {activeTab === "reports" && <ExecutiveReport result={result} recommendations={recommendations} summary={summary} historyItem={activeHistory} />}
          {activeTab === "history" && <HistoryView history={history} setResult={setResult} setActiveTab={setActiveTab} />}
          {activeTab === "settings" && <SettingsView businessProfile={businessProfile} setBusinessProfile={setBusinessProfile} />}
        </div>
      </main>

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

      {selectedRecommendation && <RecommendationDrawer recommendation={selectedRecommendation} onClose={() => setSelectedRecommendation(null)} />}
      {toast && <div className={cn("fixed bottom-5 right-5 z-50 max-w-sm rounded-2xl border px-4 py-3 text-sm font-bold shadow-2xl", toast.type === "error" ? "border-red-500/40 bg-red-950/90 text-red-100" : toast.type === "success" ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-100" : "border-blue-500/40 bg-blue-950/90 text-blue-100")}>{toast.message}</div>}
    </div>
  );
}

function DashboardView({ summary, result, recommendations, scenarios, selectedScenario, setSelectedScenario, setSelectedRecommendation, setActiveTab, history, currentFiles, products }: {
  summary: ReturnType<typeof getSummary>;
  result: AnalyzeResponse | null;
  recommendations: Recommendation[];
  scenarios?: ScenarioSimulation;
  selectedScenario: string;
  setSelectedScenario: (id: string) => void;
  setSelectedRecommendation: (rec: Recommendation) => void;
  setActiveTab: (tab: TabId) => void;
  history: HistoryItem[];
  currentFiles: [UploadRole, File][];
  products: ProductRow[];
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr_.75fr]">
        <Card className="overflow-hidden p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-300">{result?.economic_value_summary ? "Áreas económicas identificadas" : "Valor económico identificado"}</p>
              <h1 className="mt-4 text-5xl font-black tracking-tight text-white sm:text-6xl">{result?.economic_value_summary ? `${result.economic_value_summary.category_count} áreas` : formatCurrency(summary.potential)}</h1>
              <p className="mt-2 text-sm text-slate-400">{result?.economic_value_summary ? result.economic_value_summary.categories.map((category) => category.label).join(" · ") : "Estimación orientativa sobre datos de ejemplo"}</p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-300">{result?.economic_value_summary ? "Magnitudes separadas · no representan beneficio agregado" : "Demo de Financial Decision Intelligence"}</div>
            </div>
            <div className="hidden w-[45%] items-end justify-end md:flex"><Sparkline /></div>
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-sm font-semibold text-slate-300">Business Score</p>
          <div className="mt-6 flex items-end gap-1"><span className="text-5xl font-black text-white">{summary.score}</span><span className="pb-2 text-xl font-bold text-blue-400">/100</span></div>
          <div className="mt-6 h-2 rounded-full bg-slate-800"><div className="h-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" style={{ width: `${Math.min(100, summary.score)}%` }} /></div>
          <p className="mt-5 text-sm text-slate-400"><span className="text-emerald-400">●</span> Puede subir a {summary.scoreAfter}/100 aplicando las recomendaciones.</p>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-2"><span className="text-violet-300">✦</span><p className="text-sm font-bold text-white">BusinessGoal IA</p><Badge className="border-violet-400/30 bg-violet-500/15 text-violet-200">IA</Badge></div>
          <p className="mt-5 text-sm leading-6 text-slate-300">{result?.executive_summary?.ai_insight || "He encontrado una oportunidad importante. Puedes liberar aproximadamente 18.400 € si reduces el stock de estos 7 productos."}</p>
          <button onClick={() => setActiveTab("reports")} className="mt-5 rounded-xl border border-violet-400/30 px-4 py-2 text-sm font-bold text-violet-200 hover:bg-violet-500/10">Ver informe ejecutivo</button>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Kpi title="Oportunidades detectadas" value={summary.opportunities} meta="decisiones agrupadas" icon="◎" tone="blue" />
        <Kpi title="Riesgo económico estimado" value={formatCurrency(summary.loss)} meta="coste o exposición detectada" icon="⊕" tone="red" />
        <Kpi title="Productos críticos" value={summary.critical} meta="requieren revisión" icon="⬡" tone="blue" />
        <Kpi title="Acciones recomendadas" value={summary.actions} meta="con impacto directo" icon="ϟ" tone="amber" />
        <Kpi title="Capital inmovilizado" value={formatCurrency(summary.capital)} meta="stock reducible" icon="▥" tone="red" />
        <Kpi title="Margen medio" value={`${formatNumber(summary.margin, 1)}%`} meta="vs objetivo" icon="%" tone="green" />
      </div>

      <PotentialBreakdown result={result} summary={summary} />

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <TodayActions result={result} recommendations={recommendations} />
        <DecisionFeed recommendations={recommendations} setSelectedRecommendation={setSelectedRecommendation} />
      </div>

      <ScenarioSimulator scenarios={scenarios} selectedScenario={selectedScenario} setSelectedScenario={setSelectedScenario} />

      <div className="grid gap-5 xl:grid-cols-[.85fr_1.65fr]">
        <ConnectedData currentFiles={currentFiles} history={history} />
        <ProductsTable products={products} compact />
      </div>
    </div>
  );
}


function PotentialBreakdown({ result, summary }: { result: AnalyzeResponse | null; summary: ReturnType<typeof getSummary> }) {
  const components = result?.economic_value_summary?.categories?.length
    ? result.economic_value_summary.categories.map((category) => ({
        key: category.key,
        label: category.label,
        amount: category.value,
        description: category.description,
      }))
    : result?.trust_layer?.components?.length
    ? result.trust_layer.components
    : [
        { key: "cash", label: "Caja liberable", amount: summary.capital, description: "Stock de baja rotación que podría reducirse con acciones comerciales." },
        { key: "risk", label: "Riesgo económico", amount: summary.loss, description: "Exposición estimada por inventario parado, sobrecostes o ventas no capturadas." },
        { key: "margin", label: "Margen mejorable", amount: Math.max(0, summary.potential - summary.capital - summary.loss), description: "Potencial por ajustes de precio, coste o mix de productos." },
      ];
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div><h2 className="text-lg font-black text-white">Cómo se explica el valor económico</h2><p className="mt-1 text-sm text-slate-500">Desglose para separar caja liberable, margen mejorable y margen expuesto. Son magnitudes orientativas y no aditivas.</p></div>
        <Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-300">{result?.trust_layer?.confidence_level || 86}% confianza</Badge>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {components.slice(0, 3).map((component) => <div key={component.key} className="rounded-2xl border border-slate-800 bg-black/20 p-4"><p className="text-xs font-bold text-slate-500">{component.label}</p><p className="mt-2 text-2xl font-black text-white">{formatCurrency(component.amount)}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{component.description}</p></div>)}
      </div>
    </Card>
  );
}

function Kpi({ title, value, meta, icon, tone }: { title: string; value: string | number; meta: string; icon: string; tone: "blue" | "green" | "amber" | "red" }) {
  const tones = {
    blue: "text-blue-300 border-blue-400/25 bg-blue-500/10",
    green: "text-emerald-300 border-emerald-400/25 bg-emerald-500/10",
    amber: "text-amber-300 border-amber-400/25 bg-amber-500/10",
    red: "text-red-300 border-red-400/25 bg-red-500/10",
  };
  return (
    <div className="neon-card-soft rounded-[22px] p-4">
      <div className="flex items-start gap-3"><span className={cn("grid h-8 w-8 place-items-center rounded-xl border text-sm", tones[tone])}>{icon}</span><p className="text-xs font-semibold leading-4 text-slate-400">{title}</p></div>
      <p className="mt-4 text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{meta}</p>
    </div>
  );
}

function TodayActions({ result, recommendations }: { result: AnalyzeResponse | null; recommendations: Recommendation[] }) {
  const actions = result?.today_actions?.length
    ? result.today_actions.map((action) => ({ title: action.title, subtitle: action.reason, impact: action.impact, category: action.area, priority: action.priority }))
    : recommendations.slice(0, 4).map((rec) => ({ title: rec.first_step || rec.title, subtitle: rec.what_happens, impact: rec.economic_impact, category: categoryLabel(rec.category), priority: rec.priority }));
  return (
    <Card>
      <div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-white">Qué deberías hacer hoy</h2><p className="text-sm text-slate-500">Acciones priorizadas por impacto económico</p></div><button className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300">Ver todas</button></div>
      <div className="mt-5 divide-y divide-slate-800/80">
        {actions.slice(0, 4).map((action, index) => (
          <div key={`${action.title}-${index}`} className="grid grid-cols-[36px_1fr_auto] gap-3 py-4">
            <span className={cn("grid h-8 w-8 place-items-center rounded-full text-sm font-black text-white", index === 0 ? "bg-red-500" : index === 1 ? "bg-orange-500" : index === 2 ? "bg-amber-500" : "bg-slate-600")}>{index + 1}</span>
            <div><p className="text-sm font-bold text-white">{action.title}</p><p className="mt-1 line-clamp-1 text-xs text-slate-500">{action.subtitle}</p></div>
            <div className="text-right"><Badge className="border-blue-400/20 bg-blue-500/10 text-blue-200">{action.category}</Badge><p className="mt-1 text-sm font-black text-emerald-400">+ {formatCurrency(action.impact)}</p></div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DecisionFeed({ recommendations, setSelectedRecommendation }: { recommendations: Recommendation[]; setSelectedRecommendation: (rec: Recommendation) => void }) {
  return (
    <Card>
      <div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-white">Decision Feed</h2><p className="text-sm text-slate-500">Recomendaciones impulsadas por IA y datos</p></div><button className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300">Ver todas</button></div>
      <div className="mt-5 space-y-3">
        {recommendations.slice(0, 3).map((rec, index) => (
          <article key={`${rec.title}-${index}`} className="rounded-2xl border border-slate-800 bg-black/20 p-4 transition hover:border-blue-400/40">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap gap-2"><Badge className={priorityClass(rec.priority)}>{priorityLabel(rec.priority)}</Badge><Badge className="border-blue-400/20 bg-blue-500/10 text-blue-200">{categoryLabel(rec.category)}</Badge>{rec.confidence_level ? <Badge className="border-slate-600 bg-slate-800/60 text-slate-300">{formatNumber(rec.confidence_level)}% confianza</Badge> : null}</div>
                <h3 className="mt-3 text-base font-black text-white">{rec.title}</h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">{rec.what_happens}</p>
                <p className="mt-2 text-sm font-black text-emerald-400">Impacto estimado + {formatCurrency(rec.economic_impact)}</p>
              </div>
              <button onClick={() => setSelectedRecommendation(rec)} className="h-10 shrink-0 rounded-xl border border-slate-700 px-4 text-sm font-bold text-white hover:bg-white/5">Ver detalle →</button>
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
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-black text-white">Simulador de escenarios</h2><p className="mt-1 text-sm text-slate-500">Genera un análisis para comparar escenarios prudente, recomendado e intensivo.</p></div><Badge className="border-slate-700 bg-slate-800 text-slate-300">Disponible tras análisis</Badge></div>
      </Card>
    );
  }
  const selected = scenarios.scenarios.find((scenario) => scenario.id === selectedScenario) || scenarios.scenarios[0];
  return (
    <Card>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="text-lg font-black text-white">Simulador de escenarios</h2><p className="mt-1 text-sm text-slate-500">Estimación orientativa a 30 días. No representa una promesa de resultado.</p></div><div className="flex flex-wrap gap-2">{scenarios.scenarios.map((scenario) => <button key={scenario.id} onClick={() => setSelectedScenario(scenario.id)} className={cn("rounded-xl border px-3 py-2 text-xs font-black", selectedScenario === scenario.id ? "border-blue-400 bg-blue-500/20 text-blue-100" : "border-slate-700 text-slate-400 hover:text-white")}>{scenario.label}</button>)}</div></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-2xl border border-slate-800 bg-black/20 p-5"><p className="text-sm font-bold text-slate-300">Impacto estimado 30 días</p><p className="mt-3 text-4xl font-black text-emerald-400">{formatCurrency(selected.total_impact_30d)}</p><p className="mt-3 text-sm text-slate-500">Score tras escenario: <span className="font-bold text-white">{selected.score_after_scenario}/100</span> · Confianza {selected.confidence}%</p></div>
        <div className="grid gap-3 sm:grid-cols-3"><MiniScenario label="Caja liberada" value={selected.cash_released_30d} /><MiniScenario label="Mejora margen" value={selected.margin_gain_30d} /><MiniScenario label="Ventas protegidas" value={selected.sales_protected_30d} /></div>
      </div>
      <ul className="mt-5 grid gap-2 text-sm text-slate-400 lg:grid-cols-2">{selected.assumptions.slice(0, 4).map((item) => <li key={item} className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2">• {item}</li>)}</ul>
    </Card>
  );
}

function MiniScenario({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-slate-800 bg-black/20 p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 text-xl font-black text-white">{formatCurrency(value)}</p></div>;
}

function ConnectedData({ currentFiles, history }: { currentFiles: [UploadRole, File][]; history: HistoryItem[] }) {
  const filesToShow = currentFiles.length ? currentFiles : [];
  return (
    <Card>
      <div className="flex items-center justify-between"><h2 className="text-lg font-black text-white">Datos conectados</h2><Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-300">Operativo</Badge></div>
      <div className="mt-4 space-y-3">
        {filesToShow.length ? filesToShow.map(([role, file]) => <div key={role} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-black/20 px-4 py-3"><div><p className="text-sm font-bold text-white">{fileLabel(role)}</p><p className="text-xs text-slate-500">{file.name}</p></div><Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-300">Procesado</Badge></div>) : history.slice(0, 4).map((item) => <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-black/20 px-4 py-3"><div><p className="text-sm font-bold text-white">{item.fileNames[0]}</p><p className="text-xs text-slate-500">{dateLabel(item.createdAt)}</p></div><Badge className="border-slate-700 bg-slate-800 text-slate-300">{item.mergeQuality || 86}% calidad</Badge></div>)}
      </div>
    </Card>
  );
}


function riskTone(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("alto") || normalized.includes("crítico")) return "border-red-400/30 bg-red-500/15 text-red-200";
  if (normalized.includes("medio") || normalized.includes("revis")) return "border-amber-400/30 bg-amber-500/15 text-amber-200";
  return "border-emerald-400/30 bg-emerald-500/15 text-emerald-200";
}

function salesUnits(row: ProductRow) {
  return asNumber(row.units_sold_num || row.units_sold || row.ventas_90d || row.unidades_vendidas || row.sales_units || 0);
}

function productPrice(row: ProductRow) {
  return asNumber(row.sale_price_num || row.sale_price || row.pvp || row.precio || 0);
}

function productCost(row: ProductRow) {
  return asNumber(row.unit_cost_num || row.unit_cost || row.coste || row.coste_medio || 0);
}

function productMargin(row: ProductRow) {
  const existing = asNumber(row.gross_margin_pct || row.margen_bruto_pct || row.margin_pct, NaN);
  if (Number.isFinite(existing)) return existing;
  const price = productPrice(row);
  const cost = productCost(row);
  return price > 0 ? ((price - cost) / price) * 100 : 0;
}

function productRevenue(row: ProductRow) {
  return asNumber(row.revenue || row.total_revenue || row.importe_ventas || row.ingresos, salesUnits(row) * productPrice(row));
}

function coverageDays(row: ProductRow) {
  return asNumber(row.stock_coverage_days || row.dias_cobertura || row.coverage_days || 0);
}

function ProductsTable({ products, compact = false }: { products: ProductRow[]; compact?: boolean }) {
  return <InventoryTable products={products} compact={compact} />;
}

function ProductCatalogTable({ products, result }: { products: ProductRow[]; result: AnalyzeResponse | null }) {
  return (
    <div className="space-y-5">
      <Card>
        <h1 className="text-2xl font-black text-white">Productos</h1>
        <p className="mt-1 text-sm text-slate-500">Catálogo, margen, categoría y estado económico por producto.</p>
      </Card>
      <Card>
        <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-black text-white">Catálogo analizado</h2><p className="text-sm text-slate-500">Visión de producto orientada a rentabilidad y decisión comercial.</p></div><button onClick={() => exportRowsToCsv("businessgoal_productos.csv", [
            { header: "Producto", value: (row) => String(row.product_name || row.producto || "") },
            { header: "SKU", value: (row) => String(row.sku || "") },
            { header: "Categoría", value: (row) => String(row.category || row.categoria || "") },
            { header: "Proveedor", value: (row) => String(row.supplier || row.proveedor || "") },
            { header: "Coste", value: (row) => productCost(row) },
            { header: "Precio", value: (row) => productPrice(row) },
            { header: "Margen %", value: (row) => productMargin(row).toFixed(2) },
            { header: "Unidades vendidas", value: (row) => salesUnits(row) },
          ], products)} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/5">Exportar CSV</button></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left text-sm">
            <thead><tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500"><th className="pb-3">Producto</th><th className="pb-3">SKU</th><th className="pb-3">Categoría</th><th className="pb-3">Coste</th><th className="pb-3">Precio</th><th className="pb-3">Margen</th><th className="pb-3">Estado</th><th className="pb-3">Acción sugerida</th></tr></thead>
            <tbody className="divide-y divide-slate-800/80">
              {products.slice(0, 18).map((p, index) => {
                const margin = productMargin(p);
                const status = margin < 20 ? "Margen bajo" : coverageDays(p) > 180 ? "Sobrestock" : salesUnits(p) === 0 ? "Sin ventas" : "Correcto";
                const action = margin < 20 ? "Revisar precio" : coverageDays(p) > 180 ? "Reducir stock" : salesUnits(p) === 0 ? "Liquidar" : "Mantener";
                return <tr key={`${p.product_name}-${index}`} className="hover:bg-white/[0.03]"><td className="py-3"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-800 text-lg">{productIcon(index)}</span><div><p className="font-bold text-white">{String(p.product_name || p.producto || "Producto")}</p><p className="text-xs text-slate-500">{String(p.supplier || p.proveedor || "Proveedor no indicado")}</p></div></div></td><td className="py-3 text-slate-400">{String(p.sku || "—")}</td><td className="py-3 text-slate-300">{String(p.category || p.categoria || "Sin categoría")}</td><td className="py-3 text-slate-300">{formatCurrency(productCost(p), 2)}</td><td className="py-3 text-slate-300">{formatCurrency(productPrice(p), 2)}</td><td className="py-3 font-bold text-white">{formatNumber(margin, 1)}%</td><td className="py-3"><Badge className={riskTone(status)}>{status}</Badge></td><td className="py-3 text-slate-300">{action}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {!result ? <EmptyState title="Datos demo" text="Sube archivos para ver el catálogo con información real de tu negocio." /> : null}
    </div>
  );
}

function InventoryTable({ products, compact = false }: { products: ProductRow[]; compact?: boolean }) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-black text-white">Inventario detectado</h2><p className="text-sm text-slate-500">Stock, cobertura, capital inmovilizado y acción operativa.</p></div><button onClick={() => exportRowsToCsv("businessgoal_inventario.csv", [
          { header: "Producto", value: (row) => String(row.product_name || row.producto || row.sku || "") },
          { header: "SKU", value: (row) => String(row.sku || "") },
          { header: "Categoría", value: (row) => String(row.category || row.categoria || "") },
          { header: "Stock actual", value: (row) => asNumber(row.stock_units_num || row.stock || 0) },
          { header: "Cobertura días", value: (row) => coverageDays(row).toFixed(0) },
          { header: "Rotación 90d", value: (row) => asNumber(row.stock_turnover_90d || row.rotacion, 0).toFixed(2) },
          { header: "Capital inmovilizado", value: (row) => asNumber(row.inventory_value) },
          { header: "Unidades vendidas", value: (row) => salesUnits(row) },
        ], products)} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/5">Exportar CSV</button></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] border-collapse text-left text-sm">
          <thead><tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500"><th className="pb-3">Producto</th><th className="pb-3">Categoría</th><th className="pb-3">Stock actual</th><th className="pb-3">Cobertura</th><th className="pb-3">Rotación</th><th className="pb-3">Capital inmovilizado</th><th className="pb-3">Estado</th></tr></thead>
          <tbody className="divide-y divide-slate-800/80">
            {products.slice(0, compact ? 5 : 16).map((p, index) => {
              const turnover = asNumber(p.stock_turnover_90d || p.rotacion, 0);
              const coverage = coverageDays(p);
              const status = salesUnits(p) === 0 && asNumber(p.stock_units_num || p.stock || 0) > 0 ? "Sin ventas" : coverage > 180 || turnover < 0.5 ? "Alto" : turnover < 1 ? "Revisar" : "Correcto";
              return <tr key={`${p.product_name}-${index}`} className="hover:bg-white/[0.03]"><td className="py-3"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-800 text-lg">{productIcon(index)}</span><div><p className="font-bold text-white">{String(p.product_name || p.producto || p.sku || "Producto")}</p><p className="text-xs text-slate-500">{String(p.sku || "SKU no disponible")}</p></div></div></td><td className="py-3 text-slate-300">{String(p.category || p.categoria || "Sin categoría")}</td><td className="py-3 text-slate-300">{formatNumber(p.stock_units_num || p.stock || 0)} uds</td><td className="py-3 text-slate-300">{coverage ? `${formatNumber(coverage, 0)} días` : "—"}</td><td className="py-3"><span className={cn("mr-2 inline-block h-2 w-2 rounded-full", turnover < 0.5 ? "bg-red-400" : turnover < 1 ? "bg-amber-400" : "bg-emerald-400")} />{formatNumber(turnover, 1)}x</td><td className="py-3 font-bold text-white">{formatCurrency(asNumber(p.inventory_value))}</td><td className="py-3"><Badge className={riskTone(status)}>{status}</Badge></td></tr>;
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SalesTable({ products, result }: { products: ProductRow[]; result: AnalyzeResponse | null }) {
  return (
    <div className="space-y-5">
      <Card>
        <h1 className="text-2xl font-black text-white">Ventas</h1>
        <p className="mt-1 text-sm text-slate-500">Demanda reciente, ingresos estimados, margen generado y ventas protegidas.</p>
      </Card>
      <Card>
        <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-black text-white">Rendimiento de ventas</h2><p className="text-sm text-slate-500">Productos ordenados para detectar demanda, margen y riesgo de rotura.</p></div><button onClick={() => exportRowsToCsv("businessgoal_ventas.csv", [
            { header: "Producto", value: (row) => String(row.product_name || row.producto || row.sku || "") },
            { header: "Categoría", value: (row) => String(row.category || row.categoria || "") },
            { header: "Unidades vendidas", value: (row) => salesUnits(row) },
            { header: "Ingresos estimados", value: (row) => productRevenue(row).toFixed(2) },
            { header: "Margen generado", value: (row) => ((productPrice(row) - productCost(row)) * salesUnits(row)).toFixed(2) },
            { header: "Stock actual", value: (row) => asNumber(row.stock_units_num || row.stock || 0) },
            { header: "Riesgo de rotura", value: (row) => asNumber(row.stock_units_num || row.stock || 0) <= Math.max(5, salesUnits(row) * 0.15) ? "Alto" : "Normal" },
          ], products)} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/5">Exportar CSV</button></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead><tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500"><th className="pb-3">Producto</th><th className="pb-3">Unidades vendidas</th><th className="pb-3">Ingresos estimados</th><th className="pb-3">Margen generado</th><th className="pb-3">Stock actual</th><th className="pb-3">Riesgo de rotura</th><th className="pb-3">Acción comercial</th></tr></thead>
            <tbody className="divide-y divide-slate-800/80">
              {[...products].sort((a, b) => salesUnits(b) - salesUnits(a)).slice(0, 16).map((p, index) => {
                const units = salesUnits(p);
                const revenue = productRevenue(p);
                const profit = asNumber(p.gross_profit_estimated || p.beneficio_estimado, units * Math.max(0, productPrice(p) - productCost(p)));
                const stock = asNumber(p.stock_units_num || p.stock || 0);
                const risk = units > 20 && stock < Math.max(8, units * 0.2) ? "Alto" : units > 10 && stock < units * 0.4 ? "Medio" : "Bajo";
                const action = risk === "Alto" ? "Reponer prioritario" : productMargin(p) < 20 && units > 10 ? "Revisar precio" : "Mantener seguimiento";
                return <tr key={`${p.product_name}-${index}`} className="hover:bg-white/[0.03]"><td className="py-3"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-800 text-lg">{productIcon(index)}</span><div><p className="font-bold text-white">{String(p.product_name || p.producto || p.sku || "Producto")}</p><p className="text-xs text-slate-500">{String(p.category || p.categoria || "Sin categoría")}</p></div></div></td><td className="py-3 font-bold text-white">{formatNumber(units)}</td><td className="py-3 text-slate-300">{formatCurrency(revenue)}</td><td className="py-3 text-slate-300">{formatCurrency(profit)}</td><td className="py-3 text-slate-300">{formatNumber(stock)} uds</td><td className="py-3"><Badge className={riskTone(risk)}>{risk}</Badge></td><td className="py-3 text-slate-300">{action}</td></tr>;
              })}
            </tbody>
          </table>
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
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[30px] border border-slate-800 bg-[#050B16] shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-800 p-5"><div><h2 className="text-xl font-black text-white">Nuevo análisis guiado</h2><p className="mt-1 text-sm text-slate-500">Sube datos, valida columnas y genera decisiones económicas.</p></div><button onClick={props.onClose} className="rounded-xl border border-slate-800 px-3 py-2 text-sm font-bold text-slate-300">Cerrar</button></div>
        <div className="flex gap-2 border-b border-slate-800 px-5 py-4">{stepLabels.map((label, index) => <button key={label} onClick={() => props.setWizardStep((index + 1) as WizardStep)} className={cn("flex-1 rounded-xl px-3 py-2 text-xs font-black", props.wizardStep === index + 1 ? "bg-blue-600 text-white" : index + 1 < props.wizardStep ? "bg-emerald-500/15 text-emerald-200" : "bg-slate-900 text-slate-500")}>{index + 1}. {label}</button>)}</div>
        <div className="max-h-[68vh] overflow-y-auto p-5">
          {props.error ? <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-100">{props.error}</div> : null}
          {props.wizardStep === 1 && <div className="grid gap-4 md:grid-cols-2"><ChoiceCard selected={props.uploadMode === "combined"} title="Tengo todo en un archivo" text="Productos, stock, costes, precios y ventas en un único Excel o CSV." onClick={() => props.setUploadMode("combined")} /><ChoiceCard selected={props.uploadMode === "split"} title="Tengo inventario y ventas separados" text="Cruza stock actual con ventas recientes para un análisis más realista." onClick={() => props.setUploadMode("split")} /></div>}
          {props.wizardStep === 2 && <div className="grid gap-4 md:grid-cols-2">{roles.map((role) => <UploadBox key={role} role={role} file={props.files[role]} setFile={props.setFile} />)}</div>}
          {props.wizardStep === 3 && <ValidationStep inspection={props.inspection} />}
          {props.wizardStep === 4 && <BusinessProfileForm businessProfile={props.businessProfile} setBusinessProfile={props.setBusinessProfile} />}
          {props.wizardStep === 5 && <ConfirmStep files={props.files} inspection={props.inspection} businessProfile={props.businessProfile} />}
        </div>
        <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-slate-800 bg-[#050B16]/95 p-5 backdrop-blur sm:flex-row sm:justify-between"><button disabled={props.wizardStep === 1} onClick={() => props.setWizardStep(Math.max(1, props.wizardStep - 1) as WizardStep)} className="rounded-xl border border-slate-800 px-4 py-3 text-sm font-bold text-slate-300 disabled:cursor-not-allowed disabled:opacity-40">← Atrás</button><div className="flex flex-wrap gap-3">{props.wizardStep === 2 && <button disabled={!props.uploadReady || props.isInspecting} onClick={props.onInspect} className="rounded-xl bg-slate-800 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{props.isInspecting ? "Inspeccionando..." : "Inspeccionar archivos"}</button>}{props.wizardStep < 5 && ![2,3,4].includes(props.wizardStep) && <button onClick={() => props.setWizardStep(Math.min(5, props.wizardStep + 1) as WizardStep)} className="rounded-xl border border-slate-800 px-4 py-3 text-sm font-bold text-slate-300">Siguiente: Archivos →</button>}{props.wizardStep === 3 && <button onClick={() => props.setWizardStep(4)} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white">Siguiente: Negocio →</button>}{props.wizardStep === 4 && <button onClick={() => props.setWizardStep(5)} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white">Siguiente: Confirmar →</button>}{props.wizardStep === 5 && <button disabled={!props.inspection?.analysis_ready || props.isAnalyzing} onClick={props.onAnalyze} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{props.isAnalyzing ? "Generando..." : "Generar análisis"}</button>}</div></div>
      </div>
    </div>
  );
}

function ChoiceCard({ selected, title, text, onClick }: { selected: boolean; title: string; text: string; onClick: () => void }) {
  return <button onClick={onClick} className={cn("rounded-3xl border p-6 text-left transition", selected ? "border-blue-400 bg-blue-500/15" : "border-slate-800 bg-slate-950/45 hover:border-slate-600")}><p className="text-lg font-black text-white">{title}</p><p className="mt-2 text-sm leading-6 text-slate-400">{text}</p></button>;
}

function UploadBox({ role, file, setFile }: { role: UploadRole; file?: File; setFile: (role: UploadRole, file?: File) => void }) {
  return <label className="block rounded-3xl border border-dashed border-slate-700 bg-slate-950/45 p-6 transition hover:border-blue-400"><p className="text-lg font-black text-white">{fileLabel(role)}</p><p className="mt-1 text-sm text-slate-500">CSV, XLSX o XLS</p><div className="mt-6 rounded-2xl bg-black/30 p-5 text-center"><p className="text-sm font-bold text-slate-300">{file ? file.name : "Arrastra o selecciona un archivo"}</p></div><input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => setFile(role, event.target.files?.[0])} /></label>;
}

function ValidationStep({ inspection }: { inspection: InspectBatchResponse | null }) {
  if (!inspection) return <EmptyState title="Primero inspecciona los archivos" text="BusinessGoal revisará columnas, calidad de unión y vista previa antes de analizar." />;
  return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-3"><Kpi title="Calidad de unión" value={`${inspection.merge_summary?.merge_quality_score || 0}%`} meta={inspection.merge_summary?.join_strategy || "Estrategia pendiente"} icon="✓" tone="green" /><Kpi title="Filas combinadas" value={inspection.rows_after_merge} meta="listas para analizar" icon="▤" tone="blue" /><Kpi title="Archivos usados" value={inspection.merge_summary?.files_count || 0} meta="fuentes de datos" icon="□" tone="amber" /></div><div className="rounded-3xl border border-slate-800 bg-black/25 p-4"><h3 className="font-black text-white">Columnas detectadas</h3><div className="mt-4 grid gap-3 md:grid-cols-2">{inspection.merge_summary?.files?.map((file) => <div key={`${file.role}-${file.file_name}`} className="rounded-2xl border border-slate-800 p-4"><p className="text-sm font-bold text-white">{fileLabel(file.role)} · {file.file_name}</p><p className="mt-2 text-xs text-slate-500">Calidad {file.quality_score}% · {file.quality_label}</p><div className="mt-3 flex flex-wrap gap-2">{Object.entries(file.mapping || {}).filter(([, column]) => column).slice(0, 8).map(([field, column]) => <Badge key={field} className="border-slate-700 bg-slate-800 text-slate-300">{field} → {column}</Badge>)}</div></div>)}</div></div><div className="rounded-3xl border border-slate-800 bg-black/25 p-4"><h3 className="font-black text-white">Vista previa</h3><pre className="mt-3 max-h-56 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-400">{JSON.stringify(inspection.preview_rows?.slice(0, 4), null, 2)}</pre></div></div>;
}

function BusinessProfileForm({ businessProfile, setBusinessProfile }: { businessProfile: BusinessProfile; setBusinessProfile: (profile: BusinessProfile) => void }) {
  function update(key: keyof BusinessProfile, value: string | number) { setBusinessProfile({ ...businessProfile, [key]: value }); }
  return <div className="grid gap-4 md:grid-cols-2"><Field label="Nombre de empresa"><input value={businessProfile.company_name || ""} onChange={(e) => update("company_name", e.target.value)} className="w-full rounded-xl border border-slate-800 bg-black/30 px-4 py-3 text-sm outline-none" /></Field><Field label="Sector"><select value={businessProfile.sector} onChange={(e) => update("sector", e.target.value)} className="w-full rounded-xl border border-slate-800 bg-black/30 px-4 py-3 text-sm outline-none">{SECTOR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="Objetivo del análisis"><select value={businessProfile.analysis_goal} onChange={(e) => update("analysis_goal", e.target.value)} className="w-full rounded-xl border border-slate-800 bg-black/30 px-4 py-3 text-sm outline-none">{ANALYSIS_GOAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="Margen objetivo (%)"><input type="number" value={businessProfile.target_margin_pct} onChange={(e) => update("target_margin_pct", Number(e.target.value))} className="w-full rounded-xl border border-slate-800 bg-black/30 px-4 py-3 text-sm outline-none" /></Field><Field label="Margen bajo (%)"><input type="number" value={businessProfile.low_margin_pct} onChange={(e) => update("low_margin_pct", Number(e.target.value))} className="w-full rounded-xl border border-slate-800 bg-black/30 px-4 py-3 text-sm outline-none" /></Field><Field label="Cobertura máxima stock (días)"><input type="number" value={businessProfile.max_coverage_days} onChange={(e) => update("max_coverage_days", Number(e.target.value))} className="w-full rounded-xl border border-slate-800 bg-black/30 px-4 py-3 text-sm outline-none" /></Field></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-bold text-slate-300">{label}</span>{children}</label>; }

function ConfirmStep({ files, inspection, businessProfile }: { files: FileState; inspection: InspectBatchResponse | null; businessProfile: BusinessProfile }) {
  const used = Object.entries(files).filter(([, f]) => Boolean(f)) as [UploadRole, File][];
  return <div className="space-y-4"><div className="rounded-3xl border border-slate-800 bg-black/25 p-5"><h3 className="text-lg font-black text-white">Resumen antes de generar</h3><div className="mt-4 grid gap-3 md:grid-cols-2">{used.map(([role, file]) => <div key={role} className="rounded-2xl bg-slate-950/60 p-4"><p className="font-bold text-white">{fileLabel(role)}</p><p className="text-sm text-slate-500">{file.name}</p></div>)}</div></div><div className="rounded-3xl border border-slate-800 bg-black/25 p-5"><p className="font-bold text-white">Perfil aplicado</p><p className="mt-2 text-sm text-slate-400">Sector: {businessProfile.sector} · Objetivo: {businessProfile.analysis_goal} · Margen objetivo: {businessProfile.target_margin_pct}%</p><p className="mt-2 text-sm text-slate-500">Calidad de unión: {inspection?.merge_summary?.merge_quality_score || 0}%</p></div></div>;
}

function AnalysisView({
  result,
  recommendations,
  scenarios,
  selectedScenario,
  setSelectedScenario,
  setIsWizardOpen,
  setSelectedRecommendation,
}: {
  result: AnalyzeResponse | null;
  recommendations: Recommendation[];
  scenarios?: ScenarioSimulation;
  selectedScenario: string;
  setSelectedScenario: (id: string) => void;
  setIsWizardOpen: (value: boolean) => void;
  setSelectedRecommendation: (rec: Recommendation) => void;
}) {
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">Análisis</h1>
            <p className="text-sm text-slate-500">
              Revisión técnica y económica del último análisis generado.
            </p>
          </div>

          <button
            onClick={() => setIsWizardOpen(true)}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white"
          >
            Nuevo análisis
          </button>
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

function OpportunitiesView({ recommendations, setSelectedRecommendation }: { recommendations: Recommendation[]; setSelectedRecommendation: (rec: Recommendation) => void }) { return <div className="space-y-5"><Card><h1 className="text-2xl font-black text-white">Oportunidades</h1><p className="mt-1 text-sm text-slate-500">Todas las decisiones económicas detectadas, ordenadas por impacto.</p></Card><DecisionFeed recommendations={recommendations} setSelectedRecommendation={setSelectedRecommendation} /></div>; }


function FilesView({ currentFiles, history, setIsWizardOpen }: { currentFiles: [UploadRole, File][]; history: HistoryItem[]; setIsWizardOpen: (value: boolean) => void }) {
  const latest = history[0];
  return (
    <div className="space-y-5">
      <Card><div className="flex items-center justify-between"><div><h1 className="text-2xl font-black text-white">Archivos</h1><p className="text-sm text-slate-500">Carga, validación y estado de procesamiento de los datos usados por BusinessGoal.</p></div><button onClick={() => setIsWizardOpen(true)} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white">Subir archivos</button></div></Card>
      <Card>
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-black text-white">Estado de datos conectados</h2><p className="text-sm text-slate-500">Último análisis, calidad de unión y fuentes procesadas.</p></div><Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-300">Operativo</Badge></div>
        <div className="grid gap-4 md:grid-cols-3"><Kpi title="Calidad de datos" value={`${latest?.mergeQuality || 0}%`} meta="última inspección" icon="✓" tone="green" /><Kpi title="Archivos usados" value={latest?.fileNames?.length || currentFiles.length || 0} meta="fuentes del análisis" icon="□" tone="blue" /><Kpi title="Historial" value={history.length} meta="análisis guardados" icon="◷" tone="amber" /></div>
        <div className="mt-5 space-y-3">{(currentFiles.length ? currentFiles.map(([role, file]) => ({ role, name: file.name, date: "Sesión actual", quality: latest?.mergeQuality || 0 })) : latest?.fileNames.map((name, index) => ({ role: index === 0 ? "inventory" : "sales", name, date: dateLabel(latest.createdAt), quality: latest.mergeQuality || 0 })) || []).map((file) => <div key={`${file.role}-${file.name}`} className="grid gap-3 rounded-2xl border border-slate-800 bg-black/20 p-4 md:grid-cols-[1fr_auto_auto_auto]"><div><p className="font-bold text-white">{fileLabel(file.role)}</p><p className="mt-1 text-xs text-slate-500">{file.name}</p></div><Badge className="border-blue-400/20 bg-blue-500/10 text-blue-200">{file.date}</Badge><Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-300">Calidad {file.quality}%</Badge><button onClick={() => setIsWizardOpen(true)} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300">Reemplazar</button></div>)}</div>
      </Card>
    </div>
  );
}

function InventorySalesView({ mode, result, products }: { mode: "inventory" | "sales"; result: AnalyzeResponse | null; products: ProductRow[] }) {
  if (mode === "sales") return <SalesTable products={products} result={result} />;
  return <div className="space-y-5"><Card><h1 className="text-2xl font-black text-white">Inventario</h1><p className="text-sm text-slate-500">Stock, cobertura, valor inmovilizado, rotación y estado operativo.</p></Card><InventoryTable products={products} />{!result ? <EmptyState title="Datos demo" text="Sube archivos para ver esta sección con información real de tu negocio." /> : null}</div>;
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

  const trustComponents = result?.trust_layer?.components || [
    { key: "cash", label: "Caja liberable", amount: summary.capital, description: "Capital inmovilizado en inventario con baja rotación." },
    { key: "margin", label: "Margen mejorable", amount: Math.max(0, summary.grossProfit * 0.15), description: "Potencial por revisión selectiva de precio y coste." },
    { key: "sales", label: "Ventas protegidas", amount: Math.max(0, summary.potential - summary.capital), description: "Impacto orientativo por evitar roturas de stock." },
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
          <ReportMetric label="Valor económico" value={formatCurrency(summary.potential)} tone="green" />
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
                  <p className="shrink-0 text-xl font-black text-emerald-600">+ {formatCurrency(rec.economic_impact)}</p>
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
          <p className="mt-2 text-xs leading-5">Las cifras mostradas son estimaciones orientativas calculadas a partir de los datos analizados. Caja liberable, margen mejorable y ventas protegidas representan categorías económicas distintas y no constituyen una promesa de resultado.</p>
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

function HistoryView({ history, setResult, setActiveTab }: { history: HistoryItem[]; setResult: (value: AnalyzeResponse | null) => void; setActiveTab: (tab: TabId) => void }) { return <div className="space-y-5"><Card><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-black text-white">Historial de análisis</h1><p className="text-sm text-slate-500">Análisis guardados localmente durante la demo.</p></div><button onClick={() => exportHistoryToCsv(history)} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/5">Exportar historial CSV</button></div></Card><Card><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead><tr className="border-b border-slate-800 text-xs uppercase text-slate-500"><th className="pb-3">Fecha</th><th className="pb-3">Archivos</th><th className="pb-3">Valor económico</th><th className="pb-3">Oportunidades</th><th className="pb-3">Score</th><th className="pb-3">Calidad</th><th className="pb-3">Acción</th></tr></thead><tbody className="divide-y divide-slate-800">{history.map((item) => <tr key={item.id}><td className="py-4 text-slate-300">{dateLabel(item.createdAt)}</td><td className="py-4 text-slate-400">{item.fileNames.join(" + ")}</td><td className="py-4 font-black text-emerald-400">{formatCurrency(item.potential)}</td><td className="py-4 text-slate-300">{item.opportunities}</td><td className="py-4 text-slate-300">{item.score}/100</td><td className="py-4 text-slate-300">{item.mergeQuality || "—"}%</td><td className="py-4"><button onClick={() => { if (item.reportSnapshot) setResult(item.reportSnapshot); setActiveTab("reports"); }} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-white">Ver informe</button></td></tr>)}</tbody></table></div></Card></div>; }

function SettingsView({ businessProfile, setBusinessProfile }: { businessProfile: BusinessProfile; setBusinessProfile: (profile: BusinessProfile) => void }) { return <div className="space-y-5"><Card><h1 className="text-2xl font-black text-white">Configuración</h1><p className="text-sm text-slate-500">Perfil de negocio usado por defecto en los análisis.</p></Card><Card><BusinessProfileForm businessProfile={businessProfile} setBusinessProfile={setBusinessProfile} /></Card></div>; }

function RecommendationDrawer({ recommendation, onClose }: { recommendation: Recommendation; onClose: () => void }) { return <div className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-sm"><aside className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-800 bg-[#050B16] p-6 shadow-2xl"><div className="flex items-start justify-between"><div><Badge className={priorityClass(recommendation.priority)}>{priorityLabel(recommendation.priority)}</Badge><h2 className="mt-4 text-2xl font-black text-white">{recommendation.title}</h2><p className="mt-2 text-3xl font-black text-emerald-400">+ {formatCurrency(recommendation.economic_impact)}</p></div><button onClick={onClose} className="rounded-xl border border-slate-800 px-3 py-2 text-sm font-bold text-slate-300">Cerrar</button></div><div className="mt-6 space-y-4">{[{ title: "Qué ocurre", text: recommendation.what_happens }, { title: "Causa probable", text: recommendation.probable_cause }, { title: "Por qué importa", text: recommendation.why_it_matters }, { title: "Primer paso", text: recommendation.first_step }, { title: "Acción recomendada", text: recommendation.recommended_action }, { title: "Beneficio esperado", text: recommendation.expected_benefit }, { title: "Responsable sugerido", text: recommendation.suggested_owner }, { title: "Horizonte", text: recommendation.timeframe }].filter((item) => item.text).map((item) => <div key={item.title} className="rounded-2xl border border-slate-800 bg-black/25 p-4"><p className="text-sm font-black text-white">{item.title}</p><p className="mt-2 text-sm leading-6 text-slate-400">{item.text}</p></div>)}</div></aside></div>; }
