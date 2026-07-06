from __future__ import annotations

from typing import Any, Dict, List


ECONOMIC_CATEGORY_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    "cash_release": {
        "economic_class": "CASH_RELEASE",
        "label": "Caja liberable",
        "description": (
            "Capital actualmente inmovilizado en inventario que podria convertirse "
            "en liquidez si se reduce stock, se liquida o se evita recomprar."
        ),
        "is_stock": True,
        "is_flow": False,
        "represents_cash": True,
        "represents_revenue": False,
        "represents_margin": False,
        "represents_exposure": False,
        "can_sum_with": ["cash_release"],
    },
    "margin_improvement": {
        "economic_class": "MARGIN_OPPORTUNITY",
        "label": "Margen mejorable",
        "description": (
            "Mejora conservadora de margen sobre productos con demanda y margen "
            "inferior al objetivo configurado."
        ),
        "is_stock": False,
        "is_flow": True,
        "represents_cash": False,
        "represents_revenue": False,
        "represents_margin": True,
        "represents_exposure": False,
        "can_sum_with": ["margin_improvement"],
    },
    "sales_protection": {
        "economic_class": "GROSS_MARGIN_AT_RISK",
        "label": "Margen expuesto",
        "description": (
            "Exposicion estimada de margen bruto asociada a productos con demanda "
            "y stock bajo. La cifra usa margen o beneficio bruto como proxy; no "
            "representa ingresos o ventas totales demostradas."
        ),
        "is_stock": False,
        "is_flow": True,
        "represents_cash": False,
        "represents_revenue": False,
        "represents_margin": True,
        "represents_exposure": True,
        "can_sum_with": ["sales_protection"],
    },
}


def _category_value(recommendations: List[Dict[str, Any]], category: str) -> float:
    return round(
        sum(float(rec.get("economic_impact", 0) or 0) for rec in recommendations if rec.get("category") == category),
        2,
    )


def build_economic_value_summary(
    *,
    recommendations: List[Dict[str, Any]],
    analysis_period: Dict[str, Any],
) -> Dict[str, Any]:
    """Build a semantic value contract without pretending heterogeneous values are net profit."""
    categories: List[Dict[str, Any]] = []
    for key, definition in ECONOMIC_CATEGORY_DEFINITIONS.items():
        value = _category_value(recommendations, key)
        if value <= 0:
            continue
        period_days = analysis_period.get("days") if definition["is_flow"] else None
        categories.append({
            "key": key,
            "economic_class": definition["economic_class"],
            "value": value,
            "unit": "EUR",
            "period_days": period_days,
            "additive_group": key,
            "label": definition["label"],
            "description": definition["description"],
            "is_stock": definition["is_stock"],
            "is_flow": definition["is_flow"],
            "represents_cash": definition["represents_cash"],
            "represents_revenue": definition["represents_revenue"],
            "represents_margin": definition["represents_margin"],
            "represents_exposure": definition["represents_exposure"],
            "can_sum_with": definition["can_sum_with"],
        })

    display_total = round(sum(category["value"] for category in categories), 2)
    return {
        "display_total": display_total,
        "display_total_semantics": (
            "Suma dimensional legacy de magnitudes economicas heterogeneas. Se "
            "conserva por compatibilidad, pero no debe utilizarse como KPI hero ni "
            "interpretarse como beneficio neto, ingreso incremental o caja realizada."
        ),
        "display_total_role": "LEGACY_DIMENSIONAL_SUM",
        "display_total_recommended_for_hero": False,
        "is_additive": False,
        "unit": "EUR",
        "categories": categories,
        "category_count": len(categories),
        "disclaimer": (
            "Caja liberable, margen mejorable y margen expuesto son categorias "
            "economicas distintas. No deben interpretarse como beneficio contable agregado."
        ),
        "legacy_compatibility": {
            "legacy_total_impact_is_heterogeneous": True,
            "legacy_fields_preserved": [
                "summary_kpis.potential_recoverable_benefit",
                "impact_breakdown.total_impact",
            ],
        },
    }
