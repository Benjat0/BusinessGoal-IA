from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple


ECONOMIC_DRIVER_METRICS: Dict[str, List[str]] = {
    "cash_release": [
        "inventory_value",
        "stock_coverage_days",
        "stock_turnover_90d",
        "units_sold",
        "stock_units",
    ],
    "margin_improvement": [
        "gross_margin_pct",
        "gross_profit_estimated",
        "units_sold",
    ],
    "sales_protection": [
        "stock_units",
        "units_sold",
        "gross_profit_estimated",
        "stock_coverage_days",
    ],
}

DRIVER_CONFIG: Dict[str, Dict[str, Any]] = {
    "cash_release": {
        "label": "Caja liberable",
        "driver_type": "CAPITAL",
        "default_hypotheses": [
            "Compra superior a la demanda reciente",
            "Cobertura de stock por encima del objetivo",
            "Rotación reciente insuficiente",
        ],
    },
    "margin_improvement": {
        "label": "Margen mejorable",
        "driver_type": "MARGIN",
        "default_hypotheses": [
            "Precio de venta insuficiente frente al coste",
            "Descuentos acumulados",
            "Coste de compra elevado",
        ],
    },
    "sales_protection": {
        "label": "Margen expuesto",
        "driver_type": "SALES_RISK",
        "default_hypotheses": [
            "Punto de reposición bajo",
            "Demanda reciente no acompañada por stock suficiente",
            "Reposición no alineada con la velocidad de venta",
        ],
    },
}

METRIC_LABELS: Dict[str, str] = {
    "stock_units": "Stock disponible",
    "units_sold": "Unidades vendidas",
    "inventory_value": "Valor de inventario",
    "gross_margin_pct": "Margen bruto",
    "gross_profit_estimated": "Margen estimado",
    "stock_coverage_days": "Cobertura de stock",
    "stock_turnover_90d": "Rotación 90 días",
}

METRIC_UNITS: Dict[str, str] = {
    "stock_units": "UNITS",
    "units_sold": "UNITS",
    "inventory_value": "EUR",
    "gross_margin_pct": "PCT",
    "gross_profit_estimated": "EUR",
    "stock_coverage_days": "DAYS",
    "stock_turnover_90d": "RATIO",
}


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
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric):
        return None
    return numeric


def _safe_text(value: Any) -> str:
    return str(value).strip() if isinstance(value, str) and value.strip() else ""


def _profile_number(profile: Dict[str, Any], key: str) -> float | None:
    if key not in profile:
        return None
    return _nullable_number(profile.get(key))


def _driver_config(decision: Dict[str, Any], recommendation: Dict[str, Any] | None) -> Tuple[str, Dict[str, Any]]:
    category = _safe_text(decision.get("category")) or _safe_text((recommendation or {}).get("category"))
    decision_type = _safe_text(decision.get("decision_type")) or _safe_text((recommendation or {}).get("type"))

    if category in DRIVER_CONFIG:
        return category, DRIVER_CONFIG[category]
    if decision_type in {"excess_stock", "dead_stock"}:
        return "cash_release", DRIVER_CONFIG["cash_release"]
    if decision_type == "low_margin_high_sales":
        return "margin_improvement", DRIVER_CONFIG["margin_improvement"]
    if decision_type == "stockout_risk":
        return "sales_protection", DRIVER_CONFIG["sales_protection"]

    return "other", {
        "label": _safe_text(decision.get("impact_label")) or "Magnitud económica estimada",
        "driver_type": "OTHER",
        "default_hypotheses": [],
    }


def _severity(decision: Dict[str, Any], evidence_items: List[Dict[str, Any]]) -> str:
    priority = _safe_text(decision.get("priority")).lower()
    confidence = _finite_number(decision.get("confidence"), 0.0)
    impact = _finite_number(decision.get("estimated_impact"), 0.0)

    if not evidence_items and impact <= 0:
        return "UNKNOWN"
    if priority == "high" or (confidence >= 85 and impact > 0):
        return "HIGH"
    if priority == "medium":
        return "MEDIUM"
    if priority == "low":
        return "LOW"
    return "UNKNOWN"


def _threshold_value(
    *,
    metric: str,
    category_key: str,
    driver_type: str,
    snapshot: Dict[str, Any],
    business_profile: Dict[str, Any],
) -> float | None:
    if metric == "stock_coverage_days" and category_key == "cash_release":
        return _profile_number(business_profile, "max_coverage_days")
    if metric == "gross_margin_pct" and category_key == "margin_improvement":
        return _profile_number(business_profile, "low_margin_pct")
    if metric == "units_sold" and category_key == "margin_improvement":
        return _profile_number(business_profile, "min_sales_for_margin_alert")
    if metric == "units_sold" and category_key == "sales_protection":
        return _profile_number(business_profile, "min_sales_for_restock")
    if metric == "stock_units" and driver_type == "SALES_RISK":
        units_sold = _nullable_number(snapshot.get("units_sold"))
        sensitivity = _profile_number(business_profile, "stockout_sensitivity")
        if units_sold is None or sensitivity is None:
            return None
        return max(3.0, units_sold * sensitivity)
    return None


def _direction(metric: str, driver_type: str, observed_value: float | None, threshold_value: float | None) -> str:
    if observed_value is None:
        return "MISSING"
    if threshold_value is None:
        return "PRESENT"
    if metric == "gross_margin_pct":
        return "BELOW_THRESHOLD" if observed_value < threshold_value else "ABOVE_THRESHOLD"
    if metric == "stock_units" and driver_type == "SALES_RISK":
        return "BELOW_THRESHOLD" if observed_value <= threshold_value else "ABOVE_THRESHOLD"
    if metric == "stock_coverage_days" and driver_type == "CAPITAL":
        return "ABOVE_THRESHOLD" if observed_value >= threshold_value else "BELOW_THRESHOLD"
    return "ABOVE_THRESHOLD" if observed_value >= threshold_value else "BELOW_THRESHOLD"


def _signal_explanation(metric: str, direction: str) -> str:
    label = METRIC_LABELS.get(metric, metric)
    if direction == "MISSING":
        return f"{label}: métrica no disponible en la evidencia analizada."
    if direction == "ABOVE_THRESHOLD":
        return f"{label}: señal observada por encima del umbral disponible."
    if direction == "BELOW_THRESHOLD":
        return f"{label}: señal observada por debajo del umbral disponible."
    return f"{label}: señal observada en la evidencia disponible."


def _unique_product_refs(refs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    output: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for ref in refs:
        if not isinstance(ref, dict):
            continue
        identity_key = _safe_text(ref.get("identity_key"))
        if not identity_key or identity_key in seen:
            continue
        seen.add(identity_key)
        output.append(ref)
    return output


def _build_signal(
    *,
    metric: str,
    category_key: str,
    driver_type: str,
    evidence_items: List[Dict[str, Any]],
    business_profile: Dict[str, Any],
) -> Tuple[Dict[str, Any], bool]:
    observed_value: float | None = None
    threshold_value: float | None = None
    threshold_snapshot: Dict[str, Any] = {}
    present_refs: List[Dict[str, Any]] = []
    fallback_refs: List[Dict[str, Any]] = []
    saw_missing = False

    for item in evidence_items:
        if not isinstance(item, dict):
            continue
        product_ref = item.get("product_ref")
        if isinstance(product_ref, dict):
            fallback_refs.append(product_ref)

        snapshot = item.get("kpi_snapshot") if isinstance(item.get("kpi_snapshot"), dict) else {}
        value = _nullable_number(snapshot.get(metric))
        if value is None:
            saw_missing = True
            continue

        if observed_value is None:
            observed_value = value
            threshold_snapshot = snapshot
        if isinstance(product_ref, dict):
            present_refs.append(product_ref)

    threshold_value = _threshold_value(
        metric=metric,
        category_key=category_key,
        driver_type=driver_type,
        snapshot=threshold_snapshot,
        business_profile=business_profile,
    )
    direction = _direction(metric, driver_type, observed_value, threshold_value)

    return {
        "key": metric,
        "label": METRIC_LABELS.get(metric, metric),
        "observed_value": observed_value,
        "threshold_value": threshold_value,
        "unit": METRIC_UNITS.get(metric, "UNKNOWN"),
        "direction": direction,
        "explanation": _signal_explanation(metric, direction),
        "product_refs": _unique_product_refs(present_refs or fallback_refs),
    }, saw_missing or observed_value is None


def _data_limitations(
    *,
    evidence_items: List[Dict[str, Any]],
    missing_metrics: List[str],
) -> List[str]:
    limitations: List[str] = []
    if not evidence_items:
        limitations.append("No hay evidencia de producto suficiente para construir señales por producto.")

    for metric in missing_metrics:
        limitations.append(f"Falta la métrica {METRIC_LABELS.get(metric, metric)} en parte de la evidencia disponible.")

    warnings = []
    for item in evidence_items:
        product_ref = item.get("product_ref") if isinstance(item, dict) else None
        if not isinstance(product_ref, dict):
            continue
        for warning in product_ref.get("warnings") or []:
            if isinstance(warning, str) and warning and warning not in warnings:
                warnings.append(warning)

    if warnings:
        limitations.append("Hay avisos de identidad de producto en la evidencia disponible.")
    if not limitations:
        limitations.append("La lectura organiza señales disponibles y no valida una relación causal.")
    return limitations


def build_economic_driver_tree(
    *,
    decision: Dict[str, Any],
    recommendation: Dict[str, Any] | None = None,
    business_profile: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Build a deterministic economic explanation tree for a canonical Decision."""
    profile = business_profile if isinstance(business_profile, dict) else {}
    category_key, config = _driver_config(decision, recommendation)
    driver_type = str(config["driver_type"])
    label = str(config["label"])
    evidence_items = [item for item in decision.get("evidence_items", []) if isinstance(item, dict)]
    metrics = ECONOMIC_DRIVER_METRICS.get(category_key, ["inventory_value", "units_sold", "stock_units"])

    signals: List[Dict[str, Any]] = []
    missing_metrics: List[str] = []
    for metric in metrics:
        signal, has_missing = _build_signal(
            metric=metric,
            category_key=category_key,
            driver_type=driver_type,
            evidence_items=evidence_items,
            business_profile=profile,
        )
        signals.append(signal)
        if has_missing:
            missing_metrics.append(metric)

    hypotheses = [
        _safe_text(item)
        for item in decision.get("driver_hypotheses", [])
        if _safe_text(item)
    ]
    if not hypotheses:
        hypotheses = list(config.get("default_hypotheses", []))

    branch = {
        "key": f"{decision.get('decision_key', 'decision')}:economic-driver",
        "label": label,
        "driver_type": driver_type,
        "severity": _severity(decision, evidence_items),
        "signals": signals,
        "evidence_item_ids": [
            str(item.get("id"))
            for item in evidence_items
            if _safe_text(item.get("id"))
        ],
        "hypotheses": hypotheses,
    }

    return {
        "decision_id": str(decision.get("id") or ""),
        "decision_key": str(decision.get("decision_key") or ""),
        "primary_driver": {
            "key": category_key,
            "label": label,
            "economic_class": str(decision.get("impact_category") or "OTHER"),
            "value": _finite_number(decision.get("estimated_impact"), 0.0),
            "unit": "EUR",
            "explanation": f"{label}: magnitud económica estimada basada en la decisión priorizada.",
        },
        "branches": [branch],
        "data_limitations": _data_limitations(
            evidence_items=evidence_items,
            missing_metrics=missing_metrics,
        ),
        "explanation_summary": (
            f"Prioridad basada en los datos analizados: {label} con señales de "
            f"{branch['label'].lower()} y evidencia de producto disponible."
        ),
    }
