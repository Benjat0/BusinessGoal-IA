from __future__ import annotations

from typing import Any, Dict, List

from .comparability import compare_analysis_snapshots


MetricDirection = str


METRIC_CATALOG: List[Dict[str, Any]] = [
    {
        "key": "business_score_current",
        "label": "Business Score",
        "format": "score",
        "direction": "HIGHER_IS_BETTER",
    },
    {
        "key": "cash_release_potential",
        "label": "Capital que requiere atención",
        "format": "currency",
        "direction": "LOWER_IS_BETTER",
    },
    {
        "key": "average_margin_pct",
        "label": "Margen medio",
        "format": "percent",
        "direction": "HIGHER_IS_BETTER",
        "delta_unit": "percentage_points",
    },
    {
        "key": "products_without_sales",
        "label": "Productos sin ventas",
        "format": "integer",
        "direction": "LOWER_IS_BETTER",
    },
    {
        "key": "high_stock_low_sales_products",
        "label": "Productos con stock alto y baja salida",
        "format": "integer",
        "direction": "LOWER_IS_BETTER",
    },
    {
        "key": "total_inventory_value",
        "label": "Valor de inventario",
        "format": "currency",
        "direction": "NEUTRAL",
    },
]


def _require_snapshot(value: Any, name: str) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{name} debe ser un objeto de snapshot.")

    analysis_id = value.get("analysis_id")
    if not isinstance(analysis_id, str) or not analysis_id.strip():
        raise ValueError(f"{name}.analysis_id es obligatorio.")

    if not isinstance(value.get("summary_kpis"), dict):
        raise ValueError(f"{name}.summary_kpis debe ser un objeto.")

    return value


def _real_number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        numeric = float(value)
    else:
        return None
    if numeric != numeric or numeric in (float("inf"), float("-inf")):
        return None
    return numeric


def _movement(delta: float) -> str:
    if abs(delta) < 0.000001:
        return "FLAT"
    return "UP" if delta > 0 else "DOWN"


def _signal(movement: str, direction: MetricDirection) -> str:
    if movement == "FLAT" or direction == "NEUTRAL":
        return "NEUTRAL"
    if direction == "HIGHER_IS_BETTER":
        return "POSITIVE" if movement == "UP" else "NEGATIVE"
    if direction == "LOWER_IS_BETTER":
        return "POSITIVE" if movement == "DOWN" else "NEGATIVE"
    return "NEUTRAL"


def _metric_change(metric: Dict[str, Any], baseline_value: float, candidate_value: float) -> Dict[str, Any]:
    delta = round(candidate_value - baseline_value, 4)
    movement = _movement(delta)
    change = {
        "key": metric["key"],
        "label": metric["label"],
        "format": metric["format"],
        "direction": metric["direction"],
        "baseline_value": baseline_value,
        "candidate_value": candidate_value,
        "delta": delta,
        "movement": movement,
        "signal": _signal(movement, metric["direction"]),
    }

    if metric.get("delta_unit"):
        change["delta_unit"] = metric["delta_unit"]

    if metric["format"] != "percent" and baseline_value != 0:
        change["delta_pct"] = round((delta / abs(baseline_value)) * 100, 4)

    return change


def _build_metric_changes(
    *,
    status: str,
    baseline_snapshot: Dict[str, Any],
    candidate_snapshot: Dict[str, Any],
) -> tuple[List[Dict[str, Any]], bool]:
    if status == "NOT_COMPARABLE":
        return [], False

    baseline_summary = baseline_snapshot.get("summary_kpis") or {}
    candidate_summary = candidate_snapshot.get("summary_kpis") or {}
    limit = 3 if status == "PARTIALLY_COMPARABLE" else 4

    changes: List[Dict[str, Any]] = []
    for metric in METRIC_CATALOG:
        baseline_value = _real_number(baseline_summary.get(metric["key"]))
        candidate_value = _real_number(candidate_summary.get(metric["key"]))
        if baseline_value is None or candidate_value is None:
            continue
        changes.append(_metric_change(metric, baseline_value, candidate_value))

    limited = changes[:limit]
    return limited, len(changes) > len(limited)


def build_analysis_comparison(
    baseline_snapshot: Dict[str, Any],
    candidate_snapshot: Dict[str, Any],
) -> Dict[str, Any]:
    baseline = _require_snapshot(baseline_snapshot, "baseline_snapshot")
    candidate = _require_snapshot(candidate_snapshot, "candidate_snapshot")

    if baseline["analysis_id"] == candidate["analysis_id"]:
        raise ValueError("No se puede comparar un análisis consigo mismo.")

    comparability = compare_analysis_snapshots(baseline, candidate)
    changes, limit_applied = _build_metric_changes(
        status=str(comparability.get("status")),
        baseline_snapshot=baseline,
        candidate_snapshot=candidate,
    )

    return {
        "baseline_analysis_id": baseline["analysis_id"],
        "candidate_analysis_id": candidate["analysis_id"],
        "status": comparability["status"],
        "score": comparability["score"],
        "warnings": comparability["warnings"],
        "shared_products": comparability["shared_products"],
        "product_match_rate": comparability["product_match_rate"],
        "retained_product_rate": comparability["retained_product_rate"],
        "product_match_scope": comparability["product_match_scope"],
        "catalog_size_baseline": comparability["catalog_size_baseline"],
        "catalog_size_candidate": comparability["catalog_size_candidate"],
        "catalog_delta_rate": comparability["catalog_delta_rate"],
        "metric_coverage": comparability["metric_coverage"],
        "schema_overlap": comparability["schema_overlap"],
        "changes": changes,
        "limit_applied": limit_applied,
        "explanation": comparability["explanation"],
    }
