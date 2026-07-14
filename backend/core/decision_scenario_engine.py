from __future__ import annotations

import math
from typing import Any, Dict, List, Optional


SCENARIO_KEYS = ("conservative", "recommended", "intensive")


def _finite_number(value: Any, default: float = 0.0) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(numeric):
        return default
    return numeric


def _nullable_number(value: Any) -> float | None:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric):
        return None
    return round(numeric, 2)


def _profile_number(business_profile: Optional[Dict[str, Any]], key: str, default: float) -> float:
    if not isinstance(business_profile, dict):
        return default
    return _finite_number(business_profile.get(key), default)


def _bounded_confidence(decision: Dict[str, Any], delta: float = 0.0) -> int:
    base = _finite_number(decision.get("confidence"), 65)
    return int(max(0, min(100, round(base + delta))))


def _base_impact(decision: Dict[str, Any]) -> float:
    return max(0.0, _finite_number(decision.get("estimated_impact"), 0.0))


def _effects(
    *,
    cash_release: float | None = None,
    margin_improvement: float | None = None,
    gross_margin_protected: float | None = None,
    net: float | None = None,
) -> Dict[str, float | None]:
    return {
        "cash_release_estimate": _nullable_number(cash_release),
        "margin_improvement_estimate": _nullable_number(margin_improvement),
        "gross_margin_protected_estimate": _nullable_number(gross_margin_protected),
        "net_economic_estimate": _nullable_number(net),
    }


def _scenario(
    *,
    decision_id: str,
    scenario_key: str,
    label: str,
    description: str,
    scenario_type: str,
    parameters: Dict[str, Any],
    estimated_effects: Dict[str, float | None],
    risk_level: str,
    confidence: int,
    time_horizon_days: int | None,
    assumptions: List[str],
    warnings: List[str],
) -> Dict[str, Any]:
    return {
        "id": f"{decision_id}:{scenario_key}",
        "decision_id": decision_id,
        "scenario_key": scenario_key,
        "label": label,
        "description": description,
        "scenario_type": scenario_type,
        "parameters": parameters,
        "estimated_effects": estimated_effects,
        "risk_level": risk_level,
        "confidence": int(max(0, min(100, confidence))),
        "time_horizon_days": time_horizon_days,
        "assumptions": assumptions,
        "warnings": warnings,
        "recommended": scenario_key == "recommended",
    }


def _missing_impact_warning(base: float) -> List[str]:
    if base > 0:
        return []
    return ["La decisión no incluye una magnitud económica suficiente; las cifras se mantienen sin estimación cuantitativa."]


def _stock_reduction_scenarios(decision: Dict[str, Any], business_profile: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    base = _base_impact(decision)
    decision_id = str(decision.get("id") or "decision")
    target_coverage = _profile_number(business_profile, "max_coverage_days", 180)
    configs = [
        ("conservative", "Conservador", 10, 5, target_coverage, "LOW", -1, "Reducir stock objetivo 10% con descuento operativo limitado."),
        ("recommended", "Recomendado", 20, 10, target_coverage, "MEDIUM", 0, "Reducir stock objetivo 20% y revisar reposiciones de productos con baja rotación."),
        ("intensive", "Intensivo", 35, 18, 120, "HIGH", -6, "Reducir stock objetivo 35% con mayor presión comercial y más riesgo operativo."),
    ]
    scenarios: List[Dict[str, Any]] = []
    common_assumptions = [
        "La estimación usa la magnitud económica detectada en la decisión como base.",
        "La caja liberable no equivale a beneficio contable.",
        "El descuento máximo es un supuesto operativo, no una recomendación automática de precio.",
    ]
    common_warnings = [
        "La caja liberable no debe interpretarse como beneficio.",
        *_missing_impact_warning(base),
    ]

    for key, label, pct, discount, coverage, risk, confidence_delta, description in configs:
        estimate = min(base * (pct / 20), base * 2) if base > 0 else None
        scenarios.append(_scenario(
            decision_id=decision_id,
            scenario_key=key,
            label=label,
            description=description,
            scenario_type="STOCK_REDUCTION",
            parameters={
                "stock_reduction_pct": pct,
                "max_discount_pct": discount,
                "target_coverage_days": int(round(coverage)),
            },
            estimated_effects=_effects(cash_release=estimate, net=estimate),
            risk_level=risk,
            confidence=_bounded_confidence(decision, confidence_delta),
            time_horizon_days=30 if key != "intensive" else 45,
            assumptions=common_assumptions,
            warnings=common_warnings,
        ))
    return scenarios


def _margin_review_scenarios(decision: Dict[str, Any], business_profile: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    base = _base_impact(decision)
    decision_id = str(decision.get("id") or "decision")
    low_margin = _profile_number(business_profile, "low_margin_pct", 20)
    target_margin = _profile_number(business_profile, "target_margin_pct", 35)
    configs = [
        ("conservative", "Conservador", 2, low_margin, -2, "LOW", -1, "Revisar precio +2% en productos con margen por debajo del umbral operativo."),
        ("recommended", "Recomendado", 5, target_margin, -5, "MEDIUM", 0, "Revisar precio +5% y validar el margen objetivo antes de escalar cambios."),
        ("intensive", "Intensivo", 8, target_margin, -10, "HIGH", -7, "Revisar precio +8% con mayor sensibilidad comercial y seguimiento cercano."),
    ]
    assumptions = [
        "La estimación usa la magnitud económica detectada en la decisión como base.",
        "El ajuste de precio es un supuesto de escenario para comparar alternativas.",
        "La variación de unidades es una hipótesis operativa, no una estimación cerrada.",
    ]
    warnings = [
        "El efecto depende de elasticidad de demanda no estimada con estos datos.",
        "Validar reacción comercial antes de aplicar cambios masivos.",
        *_missing_impact_warning(base),
    ]

    return [
        _scenario(
            decision_id=decision_id,
            scenario_key=key,
            label=label,
            description=description,
            scenario_type="MARGIN_REVIEW",
            parameters={
                "price_adjustment_pct": pct,
                "target_margin_pct": int(round(margin)),
                "estimated_unit_variation_pct": unit_variation,
            },
            estimated_effects=_effects(
                margin_improvement=(min(base * (pct / 5), base * 1.8) if base > 0 else None),
                net=(min(base * (pct / 5), base * 1.8) if base > 0 else None),
            ),
            risk_level=risk,
            confidence=_bounded_confidence(decision, confidence_delta),
            time_horizon_days=30,
            assumptions=assumptions,
            warnings=warnings,
        )
        for key, label, pct, margin, unit_variation, risk, confidence_delta, description in configs
    ]


def _stockout_protection_scenarios(decision: Dict[str, Any], business_profile: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    void_profile = business_profile
    base = _base_impact(decision)
    decision_id = str(decision.get("id") or "decision")
    configs = [
        ("conservative", "Conservador", 5, 7, 0.5, "LOW", -1, "Reponer mínimo de seguridad para reducir exposición inmediata."),
        ("recommended", "Recomendado", 10, 14, 1.0, "MEDIUM", 0, "Reponer cobertura estimada de 14 días y revisar productos con mayor salida."),
        ("intensive", "Intensivo", 20, 30, 1.5, "HIGH", -5, "Reponer cobertura estimada de 30 días con mayor inmovilización operativa."),
    ]
    assumptions = [
        "La estimación usa la magnitud económica detectada en la decisión como base.",
        "La cobertura de reposición es un supuesto de escenario para comparar alternativas.",
        "El margen protegido es una magnitud expuesta, no una venta perdida confirmada.",
    ]
    warnings = [
        "El margen expuesto no equivale a venta perdida confirmada.",
        "Validar stock real, pedidos pendientes y plazo de proveedor.",
        *_missing_impact_warning(base),
    ]

    return [
        _scenario(
            decision_id=decision_id,
            scenario_key=key,
            label=label,
            description=description,
            scenario_type="STOCKOUT_PROTECTION",
            parameters={
                "minimum_stock_units": units,
                "demand_window_days": days,
                "replenishment_intensity": intensity,
            },
            estimated_effects=_effects(
                gross_margin_protected=(min(base * intensity, base * 1.5) if base > 0 else None),
                net=(min(base * intensity, base * 1.5) if base > 0 else None),
            ),
            risk_level=risk,
            confidence=_bounded_confidence(decision, confidence_delta),
            time_horizon_days=days,
            assumptions=assumptions,
            warnings=warnings,
        )
        for key, label, units, days, intensity, risk, confidence_delta, description in configs
    ]


def _generic_effects(category: str, base: float, multiplier: float) -> Dict[str, float | None]:
    estimate = base * multiplier if base > 0 else None
    if category == "cash_release":
        return _effects(cash_release=estimate, net=estimate)
    if category == "margin_improvement":
        return _effects(margin_improvement=estimate, net=estimate)
    if category == "sales_protection":
        return _effects(gross_margin_protected=estimate, net=estimate)
    return _effects()


def _generic_scenarios(decision: Dict[str, Any], business_profile: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    void_profile = business_profile
    base = _base_impact(decision)
    decision_id = str(decision.get("id") or "decision")
    category = str(decision.get("category") or "")
    configs = [
        ("conservative", "Prudente", 0.4, "LOW", -3, "Aplicar un primer paso limitado y revisar evidencia antes de ampliar."),
        ("recommended", "Recomendado", 0.75, "MEDIUM", -1, "Aplicar la acción recomendada con seguimiento operativo cercano."),
        ("intensive", "Intensivo", 1.0, "HIGH", -8, "Aplicar una intervención más amplia con mayor exposición operativa."),
    ]
    warnings = [
        "Faltan reglas específicas para esta decisión; los escenarios son prudentes y orientativos.",
        "Revisar evidencias y supuestos antes de registrar la decisión.",
        *_missing_impact_warning(base),
    ]

    return [
        _scenario(
            decision_id=decision_id,
            scenario_key=key,
            label=label,
            description=description,
            scenario_type="GENERIC",
            parameters={"relative_intensity": multiplier},
            estimated_effects=_generic_effects(category, base, multiplier),
            risk_level=risk,
            confidence=_bounded_confidence(decision, confidence_delta),
            time_horizon_days=decision.get("horizon_days") if isinstance(decision.get("horizon_days"), int) else None,
            assumptions=[
                "La estimación usa la magnitud económica detectada en la decisión como referencia.",
                "El escenario no implica causalidad confirmada.",
            ],
            warnings=warnings,
        )
        for key, label, multiplier, risk, confidence_delta, description in configs
    ]


def build_decision_scenarios(
    decision: Dict[str, Any],
    business_profile: Dict[str, Any] | None = None,
) -> List[Dict[str, Any]]:
    """Build deterministic scenario options for one canonical decision."""
    try:
        category = str(decision.get("category") or "")
        decision_type = str(decision.get("decision_type") or "")

        if category == "cash_release" or decision_type in {"excess_stock", "dead_stock"}:
            return _stock_reduction_scenarios(decision, business_profile)[:3]
        if category == "margin_improvement" or decision_type == "low_margin_high_sales":
            return _margin_review_scenarios(decision, business_profile)[:3]
        if category == "sales_protection" or decision_type == "stockout_risk":
            return _stockout_protection_scenarios(decision, business_profile)[:3]
        return _generic_scenarios(decision, business_profile)[:3]
    except Exception:
        return _generic_scenarios({"id": decision.get("id") if isinstance(decision, dict) else "decision"}, business_profile)[:3]
