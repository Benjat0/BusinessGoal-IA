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
    label: "Control",
    items: [{ id: "home", label: "Dashboard", icon: "home" }],
  },
  {
    label: "Decidir",
    items: [
      { id: "decisions", label: "Decisiones", icon: "decision" },
      { id: "scenarios", label: "Scenario Lab", icon: "scenario" },
    ],
  },
  {
    label: "Negocio",
    items: [
      { id: "products", label: "Productos", icon: "product" },
      { id: "inventory", label: "Inventario", icon: "inventory" },
      { id: "sales", label: "Ventas", icon: "sales" },
    ],
  },
  {
    label: "Datos",
    items: [{ id: "data", label: "Archivos y calidad", icon: "data" }],
  },
  {
    label: "Seguimiento",
    items: [{ id: "history", label: "Historial", icon: "history" }],
  },
];

export const UTILITY_NAV: NavigationItem[] = [
  { id: "settings", label: "Configuración", icon: "settings" },
];

export const PAGE_METADATA: Record<TabId, { title: string; description: string; cta?: boolean; search?: boolean }> = {
  home: {
    title: "Dashboard",
    description: "Ventas, margen, inventario y decisiones prioritarias.",
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
    title: "Archivos y calidad de datos",
    description: "Revisa qué datos se reconocen, qué análisis son válidos y qué información falta.",
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
