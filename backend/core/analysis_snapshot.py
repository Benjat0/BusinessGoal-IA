from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd

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
    if stock > 0 and sold <= 0:
        return "NO_RECENT_SALES"
    if coverage >= 180:
        return "EXCESS_COVERAGE"
    if sold >= 20 and stock <= max(3, sold * 0.15):
        return "STOCKOUT_RISK"
    if sold >= 10 and 0 < margin < 20:
        return "LOW_MARGIN_WITH_DEMAND"
    return "HEALTHY_OR_UNCLASSIFIED"


def _metric_coverage(products: List[Dict[str, Any]]) -> Dict[str, float]:
    metric_keys = [
        "stock_units",
        "units_sold",
        "revenue",
        "gross_margin_pct",
        "stock_coverage_days",
        "inventory_value",
    ]
    if not products:
        return {key: 0.0 for key in metric_keys}
    coverage: Dict[str, float] = {}
    for key in metric_keys:
        present = sum(1 for product in products if product["metrics"].get(key) not in (None, ""))
        coverage[key] = round(present / len(products), 4)
    return coverage


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
) -> Dict[str, Any]:
    metric_availability = {
        "stock_units": bool(column_mapping.get("stock_units")),
        "units_sold": bool(column_mapping.get("units_sold")),
        "revenue": bool(
            column_mapping.get("revenue")
            or (column_mapping.get("units_sold") and column_mapping.get("sale_price"))
        ),
        "gross_margin_pct": bool(column_mapping.get("unit_cost") and column_mapping.get("sale_price")),
        "gross_profit_estimated": bool(
            column_mapping.get("units_sold")
            and column_mapping.get("unit_cost")
            and column_mapping.get("sale_price")
        ),
        "stock_coverage_days": bool(column_mapping.get("stock_units") and column_mapping.get("units_sold")),
        "stock_turnover_90d": bool(column_mapping.get("stock_units") and column_mapping.get("units_sold")),
        "inventory_value": bool(column_mapping.get("stock_units") and column_mapping.get("unit_cost")),
    }

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
                "stock_units": _optional_number(row.get("stock_units_num"), available=metric_availability["stock_units"]),
                "units_sold": _optional_number(row.get("units_sold_num"), available=metric_availability["units_sold"]),
                "revenue": _optional_number(row.get("estimated_revenue"), available=metric_availability["revenue"]),
                "gross_margin_pct": _optional_number(row.get("gross_margin_pct"), available=metric_availability["gross_margin_pct"]),
                "gross_profit_estimated": _optional_number(row.get("gross_profit_estimated"), available=metric_availability["gross_profit_estimated"]),
                "stock_coverage_days": _optional_number(row.get("stock_coverage_days"), available=metric_availability["stock_coverage_days"]),
                "stock_turnover_90d": _optional_number(row.get("stock_turnover_90d"), available=metric_availability["stock_turnover_90d"], digits=4),
                "inventory_value": _optional_number(row.get("inventory_value"), available=metric_availability["inventory_value"]),
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
            "metric_coverage": _metric_coverage(product_metrics),
            "snapshot_product_limit": MAX_SNAPSHOT_PRODUCTS,
        },
    }
