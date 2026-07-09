from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd

from .kpi_engine import calculate_metric_coverage
from .utils import normalize_text


MAX_SNAPSHOT_PRODUCTS = 250


def _round_number(value: Any, digits: int = 2) -> float:
    try:
        return round(float(value or 0), digits)
    except Exception:
        return 0.0


def _optional_number(value: Any, *, available: bool, digits: int = 2) -> float | None:
    if not available or value is None or pd.isna(value):
        return None
    try:
        return round(float(value), digits)
    except Exception:
        return None


def _row_available(row: pd.Series, column: str) -> bool:
    value = row.get(column)
    if value is None or pd.isna(value):
        return False
    return bool(value)


def _product_ref(row: pd.Series) -> Dict[str, Any]:
    sku = row.get("sku")
    name = row.get("product_name")
    normalized_name = normalize_text(name)
    if pd.notna(sku) and str(sku).strip() not in {"", "None"}:
        return {
            "identity_key": f"sku:{normalize_text(sku)}",
            "identity_type": "SKU",
            "identity_confidence": 0.96,
            "sku": str(sku),
            "name": str(name) if pd.notna(name) else None,
            "warnings": [],
        }
    return {
        "identity_key": f"name:{normalized_name}",
        "identity_type": "NORMALIZED_NAME",
        "identity_confidence": 0.62 if normalized_name else 0.2,
        "sku": None,
        "name": str(name) if pd.notna(name) else None,
        "warnings": ["product_identity_uses_normalized_name"],
    }


def _economic_status(row: pd.Series) -> str:
    stock = _round_number(row.get("stock_units_num"))
    sold = _round_number(row.get("units_sold_num"))
    coverage = _round_number(row.get("stock_coverage_days"))
    margin = _round_number(row.get("gross_margin_pct"))
    stock_available = _row_available(row, "stock_units_available")
    sold_available = _row_available(row, "units_sold_available")
    coverage_available = _row_available(row, "stock_coverage_days_available")
    margin_available = _row_available(row, "gross_margin_pct_available")

    if stock_available and sold_available and stock > 0 and sold == 0:
        return "NO_RECENT_SALES"
    if coverage_available and coverage >= 180:
        return "EXCESS_COVERAGE"
    if stock_available and sold_available and sold >= 20 and stock <= max(3, sold * 0.15):
        return "STOCKOUT_RISK"
    if sold_available and margin_available and sold >= 10 and 0 < margin < 20:
        return "LOW_MARGIN_WITH_DEMAND"
    return "HEALTHY_OR_UNCLASSIFIED"


def build_analysis_snapshot(
    *,
    analysis_id: str,
    analysis_created_at: str,
    analysis_period: Dict[str, Any],
    business_profile: Dict[str, Any],
    summary: Dict[str, Any],
    economic_value_summary: Dict[str, Any],
    enriched: pd.DataFrame,
    recommendations: List[Dict[str, Any]],
    column_mapping: Dict[str, Any],
    mapping_confidence: Dict[str, float],
    validation: Dict[str, Any],
    merge_summary: Dict[str, Any] | None,
    metric_coverage: Dict[str, float] | None = None,
) -> Dict[str, Any]:
    full_metric_coverage = metric_coverage if metric_coverage is not None else calculate_metric_coverage(enriched)

    product_metrics: List[Dict[str, Any]] = []
    identity_warnings = 0
    for _, row in enriched.head(MAX_SNAPSHOT_PRODUCTS).iterrows():
        ref = _product_ref(row)
        identity_warnings += len(ref["warnings"])
        product_metrics.append({
            "product_ref": ref,
            "category": row.get("category") if pd.notna(row.get("category")) else None,
            "supplier": row.get("supplier") if pd.notna(row.get("supplier")) else None,
            "metrics": {
                "stock_units": _optional_number(row.get("stock_units_num"), available=_row_available(row, "stock_units_available")),
                "units_sold": _optional_number(row.get("units_sold_num"), available=_row_available(row, "units_sold_available")),
                "revenue": _optional_number(row.get("estimated_revenue"), available=_row_available(row, "estimated_revenue_available")),
                "gross_margin_pct": _optional_number(row.get("gross_margin_pct"), available=_row_available(row, "gross_margin_pct_available")),
                "gross_profit_estimated": _optional_number(row.get("gross_profit_estimated"), available=_row_available(row, "gross_profit_estimated_available")),
                "stock_coverage_days": _optional_number(row.get("stock_coverage_days"), available=_row_available(row, "stock_coverage_days_available")),
                "stock_turnover_90d": _optional_number(row.get("stock_turnover_90d"), available=_row_available(row, "stock_turnover_90d_available"), digits=4),
                "inventory_value": _optional_number(row.get("inventory_value"), available=_row_available(row, "inventory_value_available")),
            },
            "economic_status": _economic_status(row),
        })

    recommendation_digest: Dict[str, Any] = {
        "count": len(recommendations),
        "by_category": {},
        "by_type": {},
        "top_recommendation_refs": [],
    }
    for rec in recommendations:
        category = str(rec.get("category") or "unknown")
        rec_type = str(rec.get("type") or "unknown")
        recommendation_digest["by_category"][category] = recommendation_digest["by_category"].get(category, 0) + 1
        recommendation_digest["by_type"][rec_type] = recommendation_digest["by_type"].get(rec_type, 0) + 1
    for index, rec in enumerate(recommendations[:8]):
        recommendation_digest["top_recommendation_refs"].append({
            "rank": index + 1,
            "type": rec.get("type"),
            "category": rec.get("category"),
            "impact": _round_number(rec.get("economic_impact")),
            "affected_products": rec.get("affected_products") or [rec.get("product")],
        })

    relevant_profile = {
        key: business_profile.get(key)
        for key in [
            "sector",
            "analysis_goal",
            "target_margin_pct",
            "low_margin_pct",
            "max_coverage_days",
            "stockout_sensitivity",
            "min_sales_for_restock",
            "min_sales_for_margin_alert",
        ]
        if key in business_profile
    }

    return {
        "analysis_id": analysis_id,
        "analysis_created_at": analysis_created_at,
        "analysis_period": analysis_period,
        "business_profile_digest": relevant_profile,
        "summary_kpis": {
            key: value
            for key, value in summary.items()
            if isinstance(value, (int, float))
        },
        "economic_value_summary": economic_value_summary,
        "product_metrics": product_metrics,
        "product_count": int(len(enriched)),
        "product_metrics_count": len(product_metrics),
        "product_metrics_truncated": int(len(enriched)) > MAX_SNAPSHOT_PRODUCTS,
        "recommendation_digest": recommendation_digest,
        "data_quality": {
            "quality_score": validation.get("quality_score"),
            "quality_label": validation.get("quality_label"),
            "merge_quality_score": (merge_summary or {}).get("merge_quality_score"),
            "mapping_confidence": mapping_confidence,
            "mapped_fields": [field for field, source in column_mapping.items() if source],
            "missing_required_fields": validation.get("missing_required_fields", []),
        },
        "comparability_metadata": {
            "source_roles": {
                "combined_files": (merge_summary or {}).get("combined_files", 0),
                "inventory_files": (merge_summary or {}).get("inventory_files", 0),
                "sales_files": (merge_summary or {}).get("sales_files", 0),
            },
            "join_strategy": (merge_summary or {}).get("join_strategy"),
            "identity_warnings": identity_warnings,
            "metric_coverage": full_metric_coverage,
            "snapshot_product_limit": MAX_SNAPSHOT_PRODUCTS,
        },
    }
