import type {
  AnalyzeResponse,
  Decision,
  DecisionLifecycleEvent,
  DecisionLocalState,
  DecisionRecord,
  DecisionStatus,
} from "./types";

export const DEMO_ID_PREFIX = "demo-";
export const DECISIONS_STORAGE_KEY = "businessgoal-decisions-v20-3";
export const LEGACY_ANALYSIS_STATUS = "LEGACY_ANALYSIS";
export const MAX_DECISION_LOCAL_STATES = 100;

export type DecisionCenterMode = "DEMO" | "ACTIVE_DECISIONS" | typeof LEGACY_ANALYSIS_STATUS;

const DECISION_STATUSES = new Set<DecisionStatus>([
  "PENDING",
  "DECIDED",
  "IN_PROGRESS",
  "MONITORING",
  "COMPLETED",
  "DISCARDED",
]);

const TRANSITIONS: Record<DecisionStatus, DecisionStatus[]> = {
  PENDING: ["DECIDED", "DISCARDED"],
  DECIDED: ["IN_PROGRESS", "DISCARDED"],
  IN_PROGRESS: ["MONITORING", "COMPLETED", "DISCARDED"],
  MONITORING: ["COMPLETED", "IN_PROGRESS", "DISCARDED"],
  COMPLETED: ["MONITORING"],
  DISCARDED: ["PENDING"],
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDecisionStatus(value: unknown): value is DecisionStatus {
  return typeof value === "string" && DECISION_STATUSES.has(value as DecisionStatus);
}

function finiteNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeLifecycle(value: unknown): DecisionLifecycleEvent[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((event) => {
      const toStatus = event.to_status;
      if (!isDecisionStatus(toStatus)) return null;
      const fromStatus = event.from_status;
      return {
        id: typeof event.id === "string" && event.id ? event.id : `${event.created_at || "event"}:${toStatus}`,
        from_status: isDecisionStatus(fromStatus) ? fromStatus : null,
        to_status: toStatus,
        created_at: typeof event.created_at === "string" ? event.created_at : new Date(0).toISOString(),
      };
    })
    .filter((event): event is DecisionLifecycleEvent => Boolean(event));
}

function normalizeDecisionState(value: unknown): DecisionLocalState | null {
  if (!isRecord(value)) return null;

  const decisionId = typeof value.decision_id === "string" ? value.decision_id : "";
  const sourceAnalysisId = typeof value.source_analysis_id === "string" ? value.source_analysis_id : "";
  if (!decisionId || !sourceAnalysisId || isDemoId(decisionId)) return null;
  if (!isDecisionStatus(value.status)) return null;

  const updatedAt = typeof value.updated_at === "string" ? value.updated_at : new Date(0).toISOString();

  return {
    decision_id: decisionId,
    source_analysis_id: sourceAnalysisId,
    status: value.status,
    selected_strategy: stringOrNull(value.selected_strategy),
    economic_target: finiteNumberOrNull(value.economic_target),
    target_date: stringOrNull(value.target_date),
    user_note: stringOrNull(value.user_note),
    decided_at: stringOrNull(value.decided_at),
    completed_at: stringOrNull(value.completed_at),
    updated_at: updatedAt,
    lifecycle: normalizeLifecycle(value.lifecycle),
  };
}

function normalizeDecisionStates(value: unknown): DecisionLocalState[] | null {
  if (!Array.isArray(value)) return null;

  return value
    .map(normalizeDecisionState)
    .filter((state): state is DecisionLocalState => Boolean(state))
    .slice(0, MAX_DECISION_LOCAL_STATES);
}

export function isDemoId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith(DEMO_ID_PREFIX);
}

export function allowedDecisionTransitions(status: DecisionStatus): DecisionStatus[] {
  return TRANSITIONS[status] ?? [];
}

export function loadDecisionStates(): DecisionLocalState[] {
  return readJsonStorage<DecisionLocalState[]>(DECISIONS_STORAGE_KEY, [], normalizeDecisionStates);
}

export function saveDecisionStates(states: DecisionLocalState[]) {
  const normalized = normalizeDecisionStates(states) ?? [];
  const persistable = normalized
    .filter((state) => !isDemoId(state.decision_id))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, MAX_DECISION_LOCAL_STATES);

  if (!persistable.length) {
    removeStorageItem(DECISIONS_STORAGE_KEY);
    return;
  }

  writeJsonStorage(DECISIONS_STORAGE_KEY, persistable);
}

export function getDecisionCenterMode(result: AnalyzeResponse | null): DecisionCenterMode {
  if (!result) return "DEMO";
  if (Array.isArray(result.decisions)) return "ACTIVE_DECISIONS";
  return LEGACY_ANALYSIS_STATUS;
}

export function hydrateDecisions(decisions: Decision[], states: DecisionLocalState[]): DecisionRecord[] {
  return decisions.map((decision) => {
    const localState = states.find(
      (state) => state.decision_id === decision.id && state.source_analysis_id === decision.source_analysis_id,
    );

    return {
      ...decision,
      status: localState?.status ?? decision.status,
      selected_strategy: localState?.selected_strategy ?? decision.selected_strategy ?? null,
      economic_target: localState?.economic_target ?? decision.economic_target ?? null,
      target_date: localState?.target_date ?? decision.target_date ?? null,
      user_note: localState?.user_note ?? decision.user_note ?? null,
      decided_at: localState?.decided_at ?? null,
      completed_at: localState?.completed_at ?? null,
      updated_at: localState?.updated_at ?? null,
      lifecycle: localState?.lifecycle ?? [],
      local_state: localState,
    };
  });
}

export function updateDecisionState(
  states: DecisionLocalState[],
  decision: DecisionRecord,
  updates: Partial<Pick<DecisionLocalState, "status" | "selected_strategy" | "economic_target" | "target_date" | "user_note">>,
  now = new Date().toISOString(),
): DecisionLocalState[] {
  if (isDemoId(decision.id)) return states;

  const current = states.find(
    (state) => state.decision_id === decision.id && state.source_analysis_id === decision.source_analysis_id,
  );
  const fromStatus = current?.status ?? decision.status;
  const toStatus = updates.status ?? fromStatus;

  if (toStatus !== fromStatus && !allowedDecisionTransitions(fromStatus).includes(toStatus)) {
    return states;
  }

  const lifecycle = current?.lifecycle ? [...current.lifecycle] : [];
  if (toStatus !== fromStatus) {
    lifecycle.push({
      id: `${decision.id}:${now}:${toStatus}`,
      from_status: fromStatus,
      to_status: toStatus,
      created_at: now,
    });
  }

  const nextState: DecisionLocalState = {
    decision_id: decision.id,
    source_analysis_id: decision.source_analysis_id,
    status: toStatus,
    selected_strategy: updates.selected_strategy ?? current?.selected_strategy ?? decision.selected_strategy ?? null,
    economic_target: updates.economic_target ?? current?.economic_target ?? decision.economic_target ?? null,
    target_date: updates.target_date ?? current?.target_date ?? decision.target_date ?? null,
    user_note: updates.user_note ?? current?.user_note ?? decision.user_note ?? null,
    decided_at: current?.decided_at ?? (toStatus === "DECIDED" ? now : null),
    completed_at: toStatus === "COMPLETED" ? current?.completed_at ?? now : null,
    updated_at: now,
    lifecycle,
  };

  return [
    nextState,
    ...states.filter((state) => !(state.decision_id === decision.id && state.source_analysis_id === decision.source_analysis_id)),
  ].slice(0, MAX_DECISION_LOCAL_STATES);
}
