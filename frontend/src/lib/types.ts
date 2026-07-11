export type RecommendationPriority = "high" | "medium" | "low" | string;

export type AnalysisPeriodKind = "ASSUMED_WINDOW" | "DETECTED_DATE_RANGE" | "UNKNOWN" | string;

export type AnalysisPeriod = {
  kind: AnalysisPeriodKind;
  start_date: string | null;
  end_date: string | null;
  days: number | null;
  label: string;
  confidence: number;
  source: string;
  evidence?: string[];
};

export type EconomicClass =
  | "CASH_RELEASE"
  | "MARGIN_OPPORTUNITY"
  | "REVENUE_AT_RISK"
  | "GROSS_MARGIN_AT_RISK"
  | "COST_EXPOSURE"
  | "INVENTORY_VALUE"
  | "OTHER"
  | string;

export type EconomicValueCategory = {
  key: string;
  economic_class: EconomicClass;
  value: number;
  unit: "EUR" | string;
  period_days: number | null;
  additive_group: string | null;
  label: string;
  description: string;
  is_stock: boolean;
  is_flow: boolean;
  represents_cash: boolean;
  represents_revenue: boolean;
  represents_margin: boolean;
  represents_exposure: boolean;
  can_sum_with: string[];
};

export type EconomicValueSummary = {
  display_total: number;
  display_total_semantics: string;
  display_total_role: "LEGACY_DIMENSIONAL_SUM" | string;
  display_total_recommended_for_hero: boolean;
  is_additive: boolean;
  unit: "EUR" | string;
  categories: EconomicValueCategory[];
  category_count: number;
  disclaimer: string;
  legacy_compatibility?: {
    legacy_total_impact_is_heterogeneous: boolean;
    legacy_fields_preserved: string[];
  };
};

export type ProductRef = {
  identity_key: string;
  identity_type: "SKU" | "NORMALIZED_NAME" | string;
  identity_confidence: number;
  sku?: string | null;
  name?: string | null;
  warnings?: string[];
};

export type ProductEconomicProfile = {
  product_ref: ProductRef;
  category?: string | null;
  supplier?: string | null;
  metrics: {
    stock_units: number | null;
    units_sold: number | null;
    revenue: number | null;
    gross_margin_pct: number | null;
    gross_profit_estimated: number | null;
    stock_coverage_days: number | null;
    stock_turnover_90d: number | null;
    inventory_value: number | null;
  };
  economic_status: string;
  decision_ids?: string[];
};

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
  stock_units?: number | null;
  units_sold?: number | null;
  inventory_value?: number | null;
  gross_margin_pct?: number | null;
  gross_profit_estimated?: number | null;
  stock_coverage_days?: number | null;
  stock_turnover_90d?: number | null;
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
  is_additive?: boolean;
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
  signals?: {
    high_priority_count?: number;
    capital_pressure_pct?: number | null;
    stockout_risk_count?: number;
    dead_stock_count?: number;
    excess_stock_count?: number;
    low_margin_high_sales_count?: number;
    recommendation_count?: number;
  };
};

export type AnalysisSnapshot = {
  analysis_id: string;
  analysis_created_at: string;
  analysis_period: AnalysisPeriod;
  business_profile_digest: Partial<BusinessProfile>;
  summary_kpis: Record<string, number>;
  economic_value_summary: EconomicValueSummary;
  product_metrics: ProductEconomicProfile[];
  product_count: number;
  product_metrics_count: number;
  product_metrics_truncated: boolean;
  recommendation_digest: {
    count: number;
    by_category: Record<string, number>;
    by_type: Record<string, number>;
    top_recommendation_refs: Array<{
      rank: number;
      type?: string;
      category?: string;
      impact: number;
      affected_products?: Array<string | null | undefined>;
    }>;
  };
  data_quality: {
    quality_score?: number;
    quality_label?: string;
    merge_quality_score?: number;
    mapping_confidence: Record<string, number>;
    mapped_fields: string[];
    missing_required_fields: string[];
  };
  comparability_metadata: {
    source_roles: Record<string, number>;
    join_strategy?: string;
    identity_warnings: number;
    metric_coverage: Record<string, number>;
    snapshot_product_limit: number;
  };
};

export type ComparabilityStatus = "COMPARABLE" | "PARTIALLY_COMPARABLE" | "NOT_COMPARABLE" | string;

export type ComparabilityResult = {
  status: ComparabilityStatus;
  score: number;
  warnings: string[];
  shared_products: number;
  product_match_rate: number;
  retained_product_rate: number;
  product_match_scope: "FULL" | "SAMPLED" | string;
  catalog_size_baseline: number;
  catalog_size_candidate: number;
  catalog_delta_rate: number;
  metric_coverage: number;
  schema_overlap: number;
  explanation: string;
};

export type MetricChangeFormat = "currency" | "percent" | "integer" | "score";

export type MetricMovement = "UP" | "DOWN" | "FLAT";

export type MetricSignal = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

export type MetricDirection = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER" | "NEUTRAL";

export type AnalysisMetricChange = {
  key: string;
  label: string;
  format: MetricChangeFormat;
  direction: MetricDirection;
  baseline_value: number;
  candidate_value: number;
  delta: number;
  delta_pct?: number;
  delta_unit?: "percentage_points" | string;
  movement: MetricMovement;
  signal: MetricSignal;
};

export type AnalysisComparison = ComparabilityResult & {
  baseline_analysis_id: string;
  candidate_analysis_id: string;
  changes: AnalysisMetricChange[];
  limit_applied: boolean;
};

export type Analysis = {
  analysis_id: string;
  analysis_created_at: string;
  analysis_period: AnalysisPeriod;
  business_profile?: BusinessProfile;
  summary_kpis: Record<string, number>;
  economic_value_summary: EconomicValueSummary;
  analysis_snapshot: AnalysisSnapshot;
};

export type DecisionStatus =
  | "PENDING"
  | "DECIDED"
  | "IN_PROGRESS"
  | "MONITORING"
  | "COMPLETED"
  | "DISCARDED";

export type DecisionEvidenceItem = {
  id: string;
  product_ref: ProductRef;
  impact: number;
  priority: RecommendationPriority;
  confidence: number;
  observation: string;
  kpi_snapshot: KpiSnapshot;
};

export type Decision = {
  id: string;
  decision_key: string;
  rank: number;
  title: string;
  decision_type: string;
  category: string;
  status: DecisionStatus;
  priority: RecommendationPriority;
  estimated_impact: number;
  impact_category: EconomicClass;
  impact_label: string;
  confidence: number;
  horizon_days: number | null;
  horizon_label: string | null;
  created_at: string;
  source_analysis_id: string;
  recommendation_ids: string[];
  affected_product_refs: ProductRef[];
  affected_products_count: number;
  detection_summary: string;
  why_it_matters: string;
  recommended_action: string;
  first_step: string;
  expected_business_effect: string;
  driver_hypotheses: string[];
  evidence_items: DecisionEvidenceItem[];
  selected_strategy?: string | null;
  selected_scenario?: string | null;
  economic_target?: number | null;
  target_date?: string | null;
  user_note?: string | null;
};

export type DecisionLifecycleEvent = {
  id: string;
  from_status: DecisionStatus | null;
  to_status: DecisionStatus;
  created_at: string;
};

export type DecisionLocalState = {
  decision_id: string;
  source_analysis_id: string;
  status: DecisionStatus;
  selected_strategy: string | null;
  economic_target: number | null;
  target_date: string | null;
  user_note: string | null;
  decided_at: string | null;
  completed_at: string | null;
  updated_at: string;
  lifecycle: DecisionLifecycleEvent[];
};

export type DecisionRecord = Omit<
  Decision,
  "status" | "selected_strategy" | "economic_target" | "target_date" | "user_note"
> & {
  status: DecisionStatus;
  selected_strategy: string | null;
  economic_target: number | null;
  target_date: string | null;
  user_note: string | null;
  decided_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
  lifecycle: DecisionLifecycleEvent[];
  local_state?: DecisionLocalState;
};

export type DecisionMetricBaseline = {
  decision_id: string;
  analysis_id: string;
  metric_key: string;
  baseline_value: number;
  baseline_product_refs: ProductRef[];
  created_at: string;
  period: AnalysisPeriod;
};

export type DecisionTracking = {
  decision_id: string;
  baseline: DecisionMetricBaseline;
  latest_analysis_id?: string;
  latest_value?: number;
  observed_metric_change?: number;
  progress_pct?: number;
  tracking_status: "NOT_STARTED" | "ON_TRACK" | "OFF_TRACK" | "INSUFFICIENT_DATA" | string;
  comparability?: ComparabilityResult;
};

export type StockScenarioParameters = {
  kind: "STOCK";
  intensity: number;
  target_stock_reduction_pct?: number;
  affected_product_refs: ProductRef[];
  target_coverage_days?: number;
  max_discount_pct?: number;
};

export type MarginScenarioParameters = {
  kind: "MARGIN";
  price_adjustment_pct?: number;
  affected_product_refs: ProductRef[];
  target_margin_pct?: number;
  estimated_unit_variation_pct?: number;
};

export type StockoutScenarioParameters = {
  kind: "STOCKOUT";
  minimum_stock_units?: number;
  replenishment_units?: number;
  lead_time_days?: number;
  demand_window_days?: number;
  affected_product_refs: ProductRef[];
};

export type ScenarioParameters = StockScenarioParameters | MarginScenarioParameters | StockoutScenarioParameters;

export type Scenario = {
  id: string;
  label: string;
  decision_id?: string;
  parameters: ScenarioParameters;
  results: Record<string, number>;
  confidence: number;
  assumptions: string[];
};

export type EconomicDriver = {
  id: string;
  parent_id?: string | null;
  level: "BUSINESS" | "ECONOMIC_CATEGORY" | "SUBDRIVER" | "PRODUCT_CATEGORY" | "PRODUCT" | "DECISION" | string;
  label: string;
  economic_class?: EconomicClass;
  value?: number;
  unit?: string;
  aggregation_mode: "ADDITIVE" | "NON_ADDITIVE" | "REFERENCE";
  children?: EconomicDriver[];
  product_refs?: ProductRef[];
  decision_ids?: string[];
};

export type AIContext = {
  active_view: string;
  analysis_id?: string;
  active_product?: ProductRef;
  active_decision?: Pick<Decision, "id" | "title" | "status" | "impact_category">;
  active_scenarios?: Scenario[];
  economic_driver?: Pick<EconomicDriver, "id" | "label" | "economic_class">;
  available_metrics: string[];
};

export type AnalyzeResponse = {
  analysis_id: string;
  analysis_created_at: string;
  analysis_period: AnalysisPeriod;
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
  economic_value_summary?: EconomicValueSummary;
  analysis_snapshot?: AnalysisSnapshot;
  trust_layer?: TrustLayer;
  scenario_simulation?: ScenarioSimulation;
  decisions?: Decision[];
  recommendations: Recommendation[];
  consolidated_recommendations?: Recommendation[];
  opportunity_groups?: OpportunityGroup[];
  today_actions?: TodayActionApi[];
  action_plan?: ActionPlanItem[];
  products_preview: Record<string, string | number | null>[];
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
