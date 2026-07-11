import type { AnalyzeResponse, Decision } from "./types";

export const DEMO_ID_PREFIX = "demo-";
export const DECISIONS_STORAGE_KEY = "businessgoal-decisions-v20-3";
export const LEGACY_ANALYSIS_STATUS = "LEGACY_ANALYSIS";

export type DecisionCenterMode = "DEMO" | "ACTIVE_DECISIONS" | typeof LEGACY_ANALYSIS_STATUS;

type UnknownRecord = Record<string, unknown>;

const DECISION_STATUSES = new Set<Decision["status"]>([
  "PENDING",
  "DECIDED",
  "IN_PROGRESS",
  "MONITORING",
  "COMPLETED",
  "DISCARDED",
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeStatus(value: unknown): Decision["status"] {
  return typeof value === "string" && DECISION_STATUSES.has(value as Decision["status"])
    ? value as Decision["status"]
    : "PENDING";
}

export function isDemoId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith(DEMO_ID_PREFIX);
}

export function isPersistableDecision(decision: Decision): boolean {
  return Boolean(decision.id && decision.source_analysis_id && !isDemoId(decision.id));
}

export function normalizeDecision(value: unknown): Decision | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === "string" ? value.id : "";
  const sourceAnalysisId = typeof value.source_analysis_id === "string" ? value.source_analysis_id : "";
  const title = typeof value.title === "string" ? value.title : "";
  const estimatedImpact = asFiniteNumber(value.estimated_impact);
  const confidence = asFiniteNumber(value.confidence);

  if (!id || isDemoId(id) || !sourceAnalysisId || !title || estimatedImpact === null || confidence === null) {
    return null;
  }

  return {
    id,
    title,
    decision_type: typeof value.decision_type === "string" ? value.decision_type : "BUSINESS_DECISION",
    category: typeof value.category === "string" ? value.category : "decision",
    status: normalizeStatus(value.status),
    priority: typeof value.priority === "string" ? value.priority : "medium",
    estimated_impact: estimatedImpact,
    impact_category: typeof value.impact_category === "string" ? value.impact_category : "OTHER",
    confidence,
    horizon_days: typeof value.horizon_days === "number" && Number.isFinite(value.horizon_days) ? value.horizon_days : null,
    created_at: typeof value.created_at === "string" ? value.created_at : new Date(0).toISOString(),
    source_analysis_id: sourceAnalysisId,
    recommendation_ids: Array.isArray(value.recommendation_ids) ? value.recommendation_ids.filter((item): item is string => typeof item === "string") : [],
    affected_product_refs: Array.isArray(value.affected_product_refs) ? value.affected_product_refs as Decision["affected_product_refs"] : [],
    detection_summary: typeof value.detection_summary === "string" ? value.detection_summary : "",
    why_it_matters: typeof value.why_it_matters === "string" ? value.why_it_matters : "",
    drivers: Array.isArray(value.drivers) ? value.drivers.filter((item): item is string => typeof item === "string") : [],
    selected_scenario: typeof value.selected_scenario === "string" ? value.selected_scenario : null,
    economic_target: asFiniteNumber(value.economic_target),
    target_date: typeof value.target_date === "string" ? value.target_date : null,
    user_note: typeof value.user_note === "string" ? value.user_note : null,
  };
}

export function normalizeStoredDecisions(value: unknown): Decision[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeDecision)
    .filter((decision): decision is Decision => Boolean(decision))
    .filter(isPersistableDecision);
}

export function mergePersistableDecisions(decisions: Decision[]): Decision[] {
  const byId = new Map<string, Decision>();

  for (const decision of decisions) {
    if (isPersistableDecision(decision)) {
      byId.set(decision.id, decision);
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    const bTime = new Date(b.created_at).getTime();
    const aTime = new Date(a.created_at).getTime();
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
}

export function getResultDecisions(result: AnalyzeResponse | null): Decision[] {
  if (!result?.analysis_id || !Array.isArray(result.decisions)) return [];

  return normalizeStoredDecisions(result.decisions)
    .filter((decision) => decision.source_analysis_id === result.analysis_id);
}

export function getDecisionCenterMode(result: AnalyzeResponse | null, decisions: Decision[]): DecisionCenterMode {
  if (!result) return "DEMO";
  return decisions.length ? "ACTIVE_DECISIONS" : LEGACY_ANALYSIS_STATUS;
}
