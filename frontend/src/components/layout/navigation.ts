export type TabId =
  | "home"
  | "decisions"
  | "scenarios"
  | "analysis"
  | "products"
  | "inventory"
  | "sales"
  | "data"
  | "reports"
  | "history"
  | "ai"
  | "settings";

export type NavigationItem = {
  id: TabId;
  label: string;
  icon: IconName;
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

export type IconName =
  | "home"
  | "decision"
  | "scenario"
  | "analysis"
  | "product"
  | "inventory"
  | "sales"
  | "data"
  | "report"
  | "history"
  | "ai"
  | "settings"
  | "search"
  | "upload"
  | "mark";

export const NAV_GROUPS: NavigationGroup[] = [
  {
    label: "Overview",
    items: [{ id: "home", label: "Inicio", icon: "home" }],
  },
  {
    label: "Decision Intelligence",
    items: [
      { id: "decisions", label: "Decisiones", icon: "decision" },
      { id: "scenarios", label: "Escenarios", icon: "scenario" },
      { id: "analysis", label: "Análisis", icon: "analysis" },
    ],
  },
  {
    label: "Business",
    items: [
      { id: "products", label: "Productos", icon: "product" },
      { id: "inventory", label: "Inventario", icon: "inventory" },
      { id: "sales", label: "Ventas", icon: "sales" },
    ],
  },
  {
    label: "Data",
    items: [{ id: "data", label: "Datos", icon: "data" }],
  },
  {
    label: "Output",
    items: [
      { id: "reports", label: "Informes", icon: "report" },
      { id: "history", label: "Historial", icon: "history" },
    ],
  },
];

export const UTILITY_NAV: NavigationItem[] = [
  { id: "ai", label: "BusinessGoal IA", icon: "ai" },
  { id: "settings", label: "Configuración", icon: "settings" },
];

export const PAGE_METADATA: Record<TabId, { title: string; description: string; cta?: boolean; search?: boolean }> = {
  home: {
    title: "Inicio",
    description: "Visión económica de tu negocio.",
    cta: true,
    search: true,
  },
  decisions: {
    title: "Decisiones",
    description: "Convierte oportunidades económicas en acciones medibles.",
    cta: true,
  },
  scenarios: {
    title: "Escenarios",
    description: "Explora el impacto estimado antes de actuar.",
    cta: true,
  },
  analysis: {
    title: "Análisis",
    description: "Comprende qué está generando el impacto económico.",
    cta: true,
  },
  products: {
    title: "Productos",
    description: "Explora el comportamiento económico por producto.",
    cta: true,
    search: true,
  },
  inventory: {
    title: "Inventario",
    description: "Localiza capital inmovilizado y riesgo de rotura.",
    cta: true,
    search: true,
  },
  sales: {
    title: "Ventas",
    description: "Analiza demanda y exposición económica.",
    cta: true,
    search: true,
  },
  data: {
    title: "Datos",
    description: "Revisa las fuentes y el modelo económico utilizado.",
    cta: true,
  },
  reports: {
    title: "Informes",
    description: "Comunica los hallazgos principales.",
    cta: true,
  },
  history: {
    title: "Historial",
    description: "Consulta análisis anteriores.",
    cta: true,
  },
  ai: {
    title: "BusinessGoal IA",
    description: "Explicaciones económicas y contexto del análisis activo.",
  },
  settings: {
    title: "Configuración",
    description: "Define cómo BusinessGoal interpreta tu negocio.",
  },
};
