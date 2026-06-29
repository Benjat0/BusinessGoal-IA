from __future__ import annotations

from typing import Any, Dict, List, Optional


def _sum_impact(recommendations: List[Dict[str, Any]], category: Optional[str] = None) -> float:
    total = 0.0
    for rec in recommendations:
        if category and rec.get("category") != category:
            continue
        total += float(rec.get("economic_impact", 0) or 0)
    return round(total, 2)


def _scenario(
    *,
    scenario_id: str,
    label: str,
    description: str,
    cash_release: float,
    margin_improvement: float,
    sales_protection: float,
    score_current: float,
    score_gain: int,
    confidence: int,
    assumptions: List[str],
    recommended_actions: List[str],
) -> Dict[str, Any]:
    total = round(cash_release + margin_improvement + sales_protection, 2)
    return {
        "id": scenario_id,
        "label": label,
        "description": description,
        "total_impact_30d": total,
        "cash_released_30d": round(cash_release, 2),
        "margin_gain_30d": round(margin_improvement, 2),
        "sales_protected_30d": round(sales_protection, 2),
        "score_after_scenario": int(min(100, max(score_current, round(score_current + score_gain)))),
        "confidence": confidence,
        "assumptions": assumptions,
        "recommended_actions": recommended_actions,
    }


def build_scenario_simulation(
    summary: Dict[str, Any],
    recommendations: List[Dict[str, Any]],
    business_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build deterministic what-if scenarios from the recommendation engine output.

    The simulator is not a forecast promise. It is a directional decision-support layer
    that estimates what could be captured if the business applies different levels of
    execution discipline over the next 30 days.
    """
    profile = business_profile or {}
    goal = str(profile.get("analysis_goal", "balanced"))

    cash_total = _sum_impact(recommendations, "cash_release")
    margin_total = _sum_impact(recommendations, "margin_improvement")
    sales_total = _sum_impact(recommendations, "sales_protection")
    total_potential = round(cash_total + margin_total + sales_total, 2)
    current_score = float(summary.get("business_score_current", 82) or 82)

    high_priority = [rec for rec in recommendations if rec.get("priority") == "high"]
    top_recs = sorted(recommendations, key=lambda item: float(item.get("economic_impact", 0) or 0), reverse=True)[:5]
    top_actions = [
        str(rec.get("first_step") or rec.get("recommended_action") or rec.get("title"))
        for rec in top_recs[:3]
    ] or ["Priorizar las recomendaciones con mayor impacto económico."]

    conservative = _scenario(
        scenario_id="conservative",
        label="Escenario prudente",
        description="Aplicar solo las acciones de mayor confianza y bajo riesgo operativo.",
        cash_release=cash_total * 0.30,
        margin_improvement=margin_total * 0.35,
        sales_protection=sales_total * 0.45,
        score_current=current_score,
        score_gain=4,
        confidence=88,
        assumptions=[
            "Se ejecutan primero las acciones de alta prioridad.",
            "No se aplican cambios agresivos de precio ni liquidaciones masivas.",
            "La estimación captura solo una parte conservadora del impacto total detectado.",
        ],
        recommended_actions=top_actions[:2],
    )

    recommended = _scenario(
        scenario_id="recommended",
        label="Escenario recomendado",
        description="Ejecutar las acciones con mejor equilibrio entre impacto, confianza y facilidad operativa.",
        cash_release=cash_total * (0.55 if goal in {"balanced", "cash"} else 0.45),
        margin_improvement=margin_total * (0.65 if goal in {"balanced", "margin"} else 0.50),
        sales_protection=sales_total * (0.70 if goal in {"balanced", "growth"} else 0.55),
        score_current=current_score,
        score_gain=9,
        confidence=81,
        assumptions=[
            "Se aplican las decisiones prioritarias durante los próximos 30 días.",
            "Las acciones de margen se ejecutan de forma selectiva para no dañar la demanda.",
            "La reposición se centra en productos con ventas demostradas.",
        ],
        recommended_actions=top_actions,
    )

    ambitious = _scenario(
        scenario_id="ambitious",
        label="Escenario intensivo",
        description="Acelerar liquidaciones, ajustes de precio y reposición para capturar más impacto en menos tiempo.",
        cash_release=cash_total * 0.75,
        margin_improvement=margin_total * 0.85,
        sales_protection=sales_total * 0.90,
        score_current=current_score,
        score_gain=14,
        confidence=68,
        assumptions=[
            "El equipo ejecuta cambios comerciales y operativos en paralelo.",
            "Las liquidaciones pueden exigir descuentos o renegociación con proveedores.",
            "El escenario tiene mayor impacto potencial, pero también mayor riesgo de ejecución.",
        ],
        recommended_actions=top_actions + ["Revisar semanalmente el resultado de las acciones aplicadas."],
    )

    recommended_id = "recommended"
    if goal == "cash" and cash_total > 0:
        recommended_id = "recommended"
    elif goal == "margin" and margin_total > 0:
        recommended_id = "recommended"
    elif goal == "growth" and sales_total > 0:
        recommended_id = "recommended"

    return {
        "title": "Simulador de escenarios",
        "message": "Compara el impacto estimado de aplicar las decisiones recomendadas con distintos niveles de ejecución.",
        "recommended_scenario": recommended_id,
        "total_detected_potential": total_potential,
        "high_priority_actions": len(high_priority),
        "key_levers": [
            {"label": "Liberar caja", "value": round(cash_total, 2), "description": "Capital inmovilizado que podría reducirse actuando sobre stock lento o sin ventas."},
            {"label": "Mejorar margen", "value": round(margin_total, 2), "description": "Impacto potencial de ajustar precios o costes en productos con demanda."},
            {"label": "Proteger ventas", "value": round(sales_total, 2), "description": "Ventas que conviene proteger evitando roturas de stock."},
        ],
        "scenarios": [conservative, recommended, ambitious],
        "warning": "Las cifras son estimaciones orientativas basadas en los datos subidos. No son una promesa de resultado; sirven para priorizar decisiones.",
    }
