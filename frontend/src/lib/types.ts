export type RecommendationPriority = "high" | "medium" | "low" | string;

export type BusinessProfile = {
  company_name?: string;
  sector: "retail" | "ecommerce" | "distribution" | "manufacturing" | string;
  sector_label?: string;
  analysis_goal: "balanced" | "cash" | "margin" | "growth" | string;
  analysis_goal_label?: string;
  target_margin_pct: number;
  low_margin_pct: number;
  max_coverage_days: number;
  stockout_sensitivity: number;
  min_sales_for_restock?: number;
  min_sales_for_margin_alert?: number;
};

export type KpiSnapshot = {
  stock_units?: number;
  units_sold?: number;
  inventory_value?: number;
  gross_margin_pct?: number;
  gross_profit_estimated?: number;
  stock_coverage_days?: number;
  stock_turnover_90d?: number;
};

export type Recommendation = {
  type: string;
  category?: string;
  priority: RecommendationPriority;
  product: string;
  economic_impact: number;
  decision_score?: number;
  confidence_level?: number;
  title: string;
  action_label?: string;
  decision_theme?: string;
  what_happens: string;
  problem_description?: string;
  probable_cause?: string;
  why_it_matters: string;
  why_now?: string;
  recommended_action: string;
  first_step?: string;
  expected_business_effect?: string;
  expected_benefit?: string;
  suggested_owner?: string;
  timeframe?: string;
  affected_products?: string[];
  kpi_snapshot?: KpiSnapshot;
};

export type ActionPlanItem = {
  title: string;
  description: string;
  recommended_next_step: string;
  priority: RecommendationPriority;
  total_impact: number;
  items_count: number;
};

export type OpportunityGroup = {
  category: string;
  label: string;
  theme: string;
  description: string;
  business_question: string;
  next_step: string;
  total_impact: number;
  items_count: number;
  high_priority_count: number;
  top_products: string[];
  average_confidence: number;
  priority: RecommendationPriority;
  headline: string;
};

export type TodayActionApi = {
  title: string;
  decision: string;
  impact: number;
  priority: RecommendationPriority;
  category: string;
  area: string;
  reason: string;
  first_step: string;
  confidence_level: number;
  related_products: string[];
  recommendation_type?: string;
};


export type ScenarioLever = {
  label: string;
  value: number;
  description: string;
};

export type ScenarioOption = {
  id: string;
  label: string;
  description: string;
  total_impact_30d: number;
  cash_released_30d: number;
  margin_gain_30d: number;
  sales_protected_30d: number;
  score_after_scenario: number;
  confidence: number;
  assumptions: string[];
  recommended_actions: string[];
};

export type ScenarioSimulation = {
  title: string;
  message: string;
  recommended_scenario: string;
  total_detected_potential: number;
  high_priority_actions: number;
  key_levers: ScenarioLever[];
  scenarios: ScenarioOption[];
  warning: string;
};

export type ImpactBreakdown = {
  cash_release: number;
  capital_immobilized_reducible?: number;
  estimated_loss_or_risk?: number;
  margin_improvement: number;
  sales_protection: number;
  total_impact: number;
  explanation: string;
};

export type TrustLayerComponent = {
  key: string;
  label: string;
  amount: number;
  description: string;
};

export type TrustLayer = {
  headline: string;
  confidence_level: number;
  methodology: string;
  components: TrustLayerComponent[];
  total: number;
  caveat: string;
  evidence: Record<string, number>;
};

export type BusinessStatus = {
  status: string;
  tone: "positive" | "warning" | "info" | string;
  message: string;
};

export type AnalyzeResponse = {
  file_name: string;
  rows: number;
  columns: number;
  detected_columns: string[];
  column_mapping: Record<string, string | null>;
  mapping_confidence: Record<string, number>;
  missing_required_fields: string[];
  file_validation?: FileValidation;
  column_to_field_mapping?: Record<string, string>;
  summary_kpis: Record<string, number>;
  business_status?: BusinessStatus;
  business_profile?: BusinessProfile;
  executive_summary: {
    headline: string;
    message: string;
    ai_insight?: string;
    reading_time?: string;
    top_decision?: string | null;
    top_decision_impact?: number;
  };
  impact_breakdown?: ImpactBreakdown;
  trust_layer?: TrustLayer;
  scenario_simulation?: ScenarioSimulation;
  recommendations: Recommendation[];
  consolidated_recommendations?: Recommendation[];
  opportunity_groups?: OpportunityGroup[];
  today_actions?: TodayActionApi[];
  action_plan?: ActionPlanItem[];
  products_preview: Record<string, string | number>[];
  analysis_mode?: string;
  merge_summary?: MergeSummary;
  status: string;
};

export type FileValidationIssue = {
  severity: "error" | "warning" | "info" | string;
  field?: string;
  title: string;
  message: string;
};

export type FileValidation = {
  file_type: "combined" | "inventory" | "sales" | string;
  file_type_label: string;
  quality_score: number;
  quality_label: string;
  quality_tone: "positive" | "warning" | "critical" | string;
  required_fields: string[];
  recommended_fields: string[];
  missing_required_fields: string[];
  missing_recommended_fields: string[];
  issues: FileValidationIssue[];
  positives: string[];
  can_analyze: boolean;
};

export type FieldOption = {
  value: string;
  label: string;
};

export type InspectResponse = {
  file_name: string;
  rows: number;
  columns: number;
  detected_columns: string[];
  column_mapping: Record<string, string | null>;
  column_to_field_mapping: Record<string, string>;
  mapping_confidence: Record<string, number>;
  field_labels: Record<string, string>;
  field_descriptions: Record<string, string>;
  field_options: FieldOption[];
  preview_rows: Record<string, string>[];
  validation: FileValidation;
  status: string;
};

export type UploadRole = "combined" | "inventory" | "sales";

export type MergeFileSummary = {
  role: UploadRole | string;
  file_name: string;
  rows: number;
  columns: number;
  quality_score: number;
  quality_label: string;
  can_analyze: boolean;
  mapping: Record<string, string | null>;
  validation: FileValidation;
};

export type MergeSummary = {
  files_count: number;
  combined_files: number;
  inventory_files: number;
  sales_files: number;
  matched_sales_products: number;
  unmatched_sales_products: number;
  merge_quality_score: number;
  merge_notes: string[];
  files: MergeFileSummary[];
  join_strategy: string;
};

export type InspectBatchResponse = {
  status: string;
  analysis_ready: boolean;
  rows_after_merge: number;
  columns_after_merge: number;
  merge_summary: MergeSummary;
  preview_rows: Record<string, string>[];
  field_labels: Record<string, string>;
  field_descriptions: Record<string, string>;
  field_options: FieldOption[];
};
