from __future__ import annotations

import math
import uuid
from typing import Any, Dict, List

import pandas as pd

from .product_identity import resolve_product_ref
from .utils import normalize_text


# Fixed namespace for canonical BusinessGoal decision and evidence identifiers.
# UUIDv5 keeps ids stable for the same analysis_id + decision_key while ensuring
# the same decision_key in another analysis receives a distinct id.
BUSINESSGOAL_DECISION_NAMESPACE = uuid.UUID("5e8cb5ec-9d0f-4bb2-83b7-5ccf9d31f3a7")

IMPACT_CATEGORY_BY_RECOMMENDATION_CATEGORY: Dict[str, Dict[str, str]] = {
    "cash_release": {"impact_category": "CASH_RELEASE", "impact_label": "Caja liberable"},
    "margin_improvement": {"impact_category": "MARGIN_OPPORTUNITY", "impact_label": "Margen mejorable"},
    "sales_protection": {"impact_category": "GROSS_MARGIN_AT_RISK", "impact_label": "Margen expuesto"},
}

HORIZON_DAYS_BY_DECISION_TYPE: Dict[str, int] = {
    "excess_stock": 30,
    "dead_stock": 14,
    "low_margin_high_sales": 30,
    "stockout_risk": 7,
}

KPI_SNAPSHOT_KEYS = [
    "stock_units",
    "units_sold",
    "inventory_value",
    "gross_margin_pct",
    "gross_profit_estimated",
    "stock_coverage_days",
    "stock_turnover_90d",
]


def _finite_number(value: Any, default: float = 0.0) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(numeric):
        return default
    return numeric


def _nullable_number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric):
        return None
    return numeric


def _sanitize_kpi_snapshot(snapshot: Any) -> Dict[str, float | None]:
    if not isinstance(snapshot, dict):
        return {key: None for key in KPI_SNAPSHOT_KEYS}
    return {key: _nullable_number(snapshot.get(key)) for key in KPI_SNAPSHOT_KEYS}


def _impact_config(category: str) -> Dict[str, str]:
    return IMPACT_CATEGORY_BY_RECOMMENDATION_CATEGORY.get(
        category,
        {"impact_category": "OTHER", "impact_label": "Magnitud económica estimada"},
    )


def _stable_uuid(*parts: str) -> str:
    return str(uuid.uuid5(BUSINESSGOAL_DECISION_NAMESPACE, ":".join(parts)))


def _decision_key(recommendation: Dict[str, Any]) -> str:
    decision_type = str(recommendation.get("type") or "unknown")
    category = str(recommendation.get("category") or "unknown")
    return f"{decision_type}:{category}"


def _driver_hypotheses(recommendation: Dict[str, Any]) -> List[str]:
    candidates = [
        recommendation.get("probable_cause"),
        recommendation.get("problem_description"),
    ]
    return [str(item).strip() for item in candidates if isinstance(item, str) and item.strip()]


def _build_evidence_items(
    *,
    analysis_id: str,
    decision_key: str,
    recommendation: Dict[str, Any],
    enriched: pd.DataFrame,
) -> List[Dict[str, Any]]:
    detail_items = recommendation.get("detail_items")
    if not isinstance(detail_items, list):
        detail_items = []

    evidence_items: List[Dict[str, Any]] = []
    for position, item in enumerate(detail_items, start=1):
        if not isinstance(item, dict):
            continue
        product_ref, product_name = resolve_product_ref(item.get("product"), enriched)
        identity_key = str(product_ref.get("identity_key") or "")
        if not identity_key:
            identity_key = f"name:{normalize_text(product_name)}:{position}"

        evidence_items.append({
            "id": _stable_uuid(analysis_id, decision_key, "evidence", identity_key, str(position)),
            "product_ref": product_ref,
            "impact": _finite_number(item.get("impact")),
            "priority": str(item.get("priority") or recommendation.get("priority") or "medium"),
            "confidence": int(round(_finite_number(item.get("confidence_level"), _finite_number(recommendation.get("confidence_level"), 75)))),
            "observation": str(item.get("what_happens") or "").strip(),
            "kpi_snapshot": _sanitize_kpi_snapshot(item.get("kpi_snapshot")),
        })

    return evidence_items


def build_decisions(
    *,
    analysis_id: str,
    analysis_created_at: str,
    consolidated_recommendations: List[Dict[str, Any]],
    enriched: pd.DataFrame,
) -> List[Dict[str, Any]]:
    """Build canonical Decision records from consolidated recommendations.

    `recommendation_ids` uses deterministic evidence item ids because the current
    recommendation engine does not emit formal recommendation ids yet.
    """
    if not consolidated_recommendations:
        return []

    decisions: List[Dict[str, Any]] = []
    for index, recommendation in enumerate(consolidated_recommendations, start=1):
        decision_type = str(recommendation.get("type") or "unknown")
        category = str(recommendation.get("category") or "unknown")
        decision_key = _decision_key(recommendation)
        impact_config = _impact_config(category)
        evidence_items = _build_evidence_items(
            analysis_id=analysis_id,
            decision_key=decision_key,
            recommendation=recommendation,
            enriched=enriched,
        )

        decisions.append({
            "id": _stable_uuid(analysis_id, decision_key),
            "decision_key": decision_key,
            "rank": index,
            "title": str(recommendation.get("title") or "Decisión recomendada"),
            "decision_type": decision_type,
            "category": category,
            "status": "PENDING",
            "priority": str(recommendation.get("priority") or "medium"),
            "estimated_impact": _finite_number(recommendation.get("economic_impact")),
            "impact_category": impact_config["impact_category"],
            "impact_label": impact_config["impact_label"],
            "confidence": int(round(_finite_number(recommendation.get("confidence_level"), 75))),
            "horizon_days": HORIZON_DAYS_BY_DECISION_TYPE.get(decision_type),
            "horizon_label": recommendation.get("timeframe") if isinstance(recommendation.get("timeframe"), str) else None,
            "created_at": analysis_created_at,
            "source_analysis_id": analysis_id,
            "recommendation_ids": [item["id"] for item in evidence_items],
            "affected_product_refs": [item["product_ref"] for item in evidence_items],
            "affected_products_count": int(recommendation.get("affected_products_count") or len(evidence_items)),
            "detection_summary": str(recommendation.get("what_happens") or recommendation.get("problem_description") or ""),
            "why_it_matters": str(recommendation.get("why_it_matters") or ""),
            "recommended_action": str(recommendation.get("recommended_action") or ""),
            "first_step": str(recommendation.get("first_step") or ""),
            "expected_business_effect": str(recommendation.get("expected_business_effect") or ""),
            "driver_hypotheses": _driver_hypotheses(recommendation),
            "evidence_items": evidence_items,
            "selected_strategy": None,
            "selected_scenario": None,
            "economic_target": None,
            "target_date": None,
            "user_note": None,
        })

    return decisions
