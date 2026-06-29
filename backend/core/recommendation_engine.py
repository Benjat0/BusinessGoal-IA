from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Optional

import pandas as pd


CATEGORY_CONFIG: Dict[str, Dict[str, str]] = {
    "cash_release": {
        "label": "Liberar caja",
        "theme": "Inventario",
        "description": "Capital bloqueado en productos con baja rotación, exceso de cobertura o ventas nulas.",
        "next_step": "Crear una lista de liquidación, pausar compras y revisar stock objetivo por producto.",
        "business_question": "¿Dónde tengo dinero parado?",
    },
    "margin_improvement": {
        "label": "Mejorar margen",
        "theme": "Rentabilidad",
        "description": "Productos que venden pero aportan menos beneficio del esperado.",
        "next_step": "Revisar precio mínimo rentable, negociar coste con proveedor o crear packs de mayor margen.",
        "business_question": "¿Dónde gano poco aunque vendo?",
    },
    "sales_protection": {
        "label": "Evitar ventas perdidas",
        "theme": "Ventas",
        "description": "Productos con demanda demostrada y stock bajo que podrían romper disponibilidad.",
        "next_step": "Definir punto mínimo de reposición y lanzar pedido prioritario para productos de alta demanda.",
        "business_question": "¿Qué ventas puedo perder si no actúo?",
    },
    "risk_reduction": {
        "label": "Reducir riesgo",
        "theme": "Control",
        "description": "Situaciones que pueden deteriorar margen, caja o disponibilidad si no se gestionan.",
        "next_step": "Revisar datos, definir responsable y convertir la alerta en tarea operativa.",
        "business_question": "¿Qué debo controlar primero?",
    },
}


def _product_label(row: pd.Series) -> str:
    name = row.get("product_name")
    sku = row.get("sku")
    if pd.notna(name) and str(name).strip() not in ("", "None"):
        return str(name)
    if pd.notna(sku) and str(sku).strip() not in ("", "None"):
        return f"Producto {sku}"
    return "Producto sin nombre"


def _kpi_snapshot(row: pd.Series) -> Dict[str, float]:
    return {
        "stock_units": round(float(row.get("stock_units_num", 0) or 0), 2),
        "units_sold": round(float(row.get("units_sold_num", 0) or 0), 2),
        "inventory_value": round(float(row.get("inventory_value", 0) or 0), 2),
        "gross_margin_pct": round(float(row.get("gross_margin_pct", 0) or 0), 2),
        "gross_profit_estimated": round(float(row.get("gross_profit_estimated", 0) or 0), 2),
        "stock_coverage_days": round(float(row.get("stock_coverage_days", 0) or 0), 2),
        "stock_turnover_90d": round(float(row.get("stock_turnover_90d", 0) or 0), 4),
    }


def _margin_improvement_impact(row: pd.Series, target_margin_pct: float) -> float:
    sale_price = float(row.get("sale_price_num", 0) or 0)
    sold = float(row.get("units_sold_num", 0) or 0)
    current_margin = float(row.get("gross_margin_pct", 0) or 0)
    if sale_price <= 0 or sold <= 0 or current_margin <= 0:
        return 0.0
    gap_pct = max(0.0, target_margin_pct - current_margin)
    # Conservative MVP estimate: recover only half of the margin gap to avoid overpromising.
    return round(sale_price * sold * (gap_pct / 100) * 0.5, 2)


def _priority_from_impact(impact: float, high_threshold: float = 1500, medium_threshold: float = 300) -> str:
    if impact >= high_threshold:
        return "high"
    if impact >= medium_threshold:
        return "medium"
    return "low"


def _add_decision_scores(recommendations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Add deterministic decision score and confidence from 0 to 100."""
    if not recommendations:
        return recommendations

    max_impact = max(float(item.get("economic_impact", 0) or 0) for item in recommendations) or 1
    priority_weight = {"high": 35, "medium": 22, "low": 12}
    evidence_weight = {
        "dead_stock": 35,
        "excess_stock": 32,
        "stockout_risk": 28,
        "low_margin_high_sales": 24,
    }

    for item in recommendations:
        impact = float(item.get("economic_impact", 0) or 0)
        impact_score = min(40, (impact / max_impact) * 40)
        evidence_score = evidence_weight.get(item.get("type"), 20)
        item["decision_score"] = round(impact_score + priority_weight.get(item.get("priority"), 12) + evidence_score, 0)
        item["decision_score"] = int(max(0, min(100, item["decision_score"])))

        if item.get("type") == "dead_stock":
            confidence = 94
        elif item.get("type") == "excess_stock":
            confidence = 91
        elif item.get("type") == "stockout_risk":
            confidence = 87
        elif item.get("type") == "low_margin_high_sales":
            confidence = 80
        else:
            confidence = 75

        # Slightly reduce confidence when the impact is very small.
        if impact < 250:
            confidence -= 5
        item["confidence_level"] = int(max(60, min(96, confidence)))

    return recommendations


def build_recommendations(enriched: pd.DataFrame, business_profile: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Build deterministic, auditable business recommendations for the MVP.

    The LLM should explain later, not invent the financial basis. This engine produces
    the evidence, prioritization and economic impact used by the interface.
    """
    recommendations: List[Dict[str, Any]] = []

    if enriched.empty:
        return recommendations

    profile = business_profile or {}
    margin_median = float(enriched["gross_margin_pct"].median()) if "gross_margin_pct" in enriched else 0
    target_margin_pct = float(profile.get("target_margin_pct", max(25.0, min(45.0, margin_median))) or 35.0)
    low_margin_threshold = float(profile.get("low_margin_pct", max(15.0, margin_median * 0.7)) or 20.0)
    max_coverage_days = float(profile.get("max_coverage_days", 180.0) or 180.0)
    stockout_sensitivity = float(profile.get("stockout_sensitivity", 0.15) or 0.15)
    min_sales_for_restock = float(profile.get("min_sales_for_restock", 20.0) or 20.0)
    min_sales_for_margin_alert = float(profile.get("min_sales_for_margin_alert", 10.0) or 10.0)
    high_impact_threshold = float(profile.get("high_impact_threshold", 1500.0) or 1500.0)
    medium_impact_threshold = float(profile.get("medium_impact_threshold", 350.0) or 350.0)
    sector_label = profile.get("sector_label", "Retail / comercio")
    goal_label = profile.get("analysis_goal_label", "Equilibrado")

    for _, row in enriched.iterrows():
        product = _product_label(row)
        stock = float(row.get("stock_units_num", 0) or 0)
        sold = float(row.get("units_sold_num", 0) or 0)
        inventory_value = float(row.get("inventory_value", 0) or 0)
        margin_pct = float(row.get("gross_margin_pct", 0) or 0)
        coverage_days = float(row.get("stock_coverage_days", 0) or 0)
        gross_profit = float(row.get("gross_profit_estimated", 0) or 0)
        snapshot = _kpi_snapshot(row)

        if stock > 0 and sold <= 0 and inventory_value > 0:
            impact = round(inventory_value, 2)
            recommendations.append({
                "type": "dead_stock",
                "category": "cash_release",
                "priority": _priority_from_impact(impact, high_threshold=max(750, high_impact_threshold * 0.65), medium_threshold=max(150, medium_impact_threshold * 0.65)),
                "product": product,
                "economic_impact": impact,
                "title": "Liquidar productos sin ventas recientes",
                "action_label": "Liquidar o reactivar",
                "decision_theme": "Liberar caja",
                "what_happens": f"{product} mantiene {stock:.0f} unidades en stock y no registra ventas en el periodo analizado.",
                "problem_description": "Inventario sin salida comercial en el periodo analizado.",
                "probable_cause": "Demanda insuficiente, precio poco competitivo, producto desactualizado o falta de visibilidad comercial.",
                "why_it_matters": f"Hay aproximadamente {inventory_value:,.2f} € inmovilizados en inventario que no está generando caja.",
                "why_now": "Cada día que el producto permanece sin vender aumenta el coste de oportunidad y reduce liquidez disponible.",
                "recommended_action": "Crear una acción de liquidación parcial, pausar nuevas compras y valorar pack, descuento o devolución al proveedor.",
                "first_step": "Marcar el producto como candidato a liquidación y revisar el precio mínimo aceptable esta semana.",
                "expected_business_effect": "Liberar caja y reducir inventario improductivo.",
                "expected_benefit": f"Recuperar hasta {inventory_value:,.2f} € de capital actualmente bloqueado, según stock disponible y coste unitario.",
                "suggested_owner": "Compras / Dirección comercial",
                "timeframe": "7 días",
                "affected_products": [product],
                "kpi_snapshot": snapshot,
            })
            continue

        if stock > 0 and sold > 0 and coverage_days >= max_coverage_days and inventory_value > 0:
            impact = round(inventory_value, 2)
            recommendations.append({
                "type": "excess_stock",
                "category": "cash_release",
                "priority": _priority_from_impact(impact, high_threshold=high_impact_threshold, medium_threshold=medium_impact_threshold),
                "product": product,
                "economic_impact": impact,
                "title": "Liberar capital inmovilizado en productos de baja demanda",
                "action_label": "Reducir stock objetivo",
                "decision_theme": "Liberar caja",
                "what_happens": f"{product} tiene una cobertura estimada de {coverage_days:.0f} días con el ritmo de ventas actual.",
                "problem_description": "El nivel de inventario está muy por encima de la velocidad real de venta.",
                "probable_cause": "Compra sobredimensionada, previsión de demanda optimista o falta de seguimiento de rotación.",
                "why_it_matters": f"El inventario representa {inventory_value:,.2f} € de capital inmovilizado.",
                "why_now": f"La cobertura supera el umbral configurado para {sector_label}: {max_coverage_days:.0f} días. Seguir comprando aumentaría el capital bloqueado.",
                "recommended_action": "Reducir compras, activar promoción parcial y ajustar el nivel de stock objetivo a la demanda real.",
                "first_step": "Pausar reposiciones y definir una acción comercial para reducir cobertura durante los próximos 30 días.",
                "expected_business_effect": "Liberar capital inmovilizado y evitar nuevas compras innecesarias.",
                "expected_benefit": f"Reducir exposición financiera y liberar hasta {inventory_value:,.2f} € si se liquida o corrige el nivel de stock.",
                "suggested_owner": "Compras / Operaciones",
                "timeframe": "30 días",
                "affected_products": [product],
                "kpi_snapshot": snapshot,
            })

        margin_impact = _margin_improvement_impact(row, target_margin_pct)
        if sold >= min_sales_for_margin_alert and margin_pct > 0 and margin_pct < low_margin_threshold:
            impact = round(max(margin_impact, gross_profit * 0.15, 50), 2)
            recommendations.append({
                "type": "low_margin_high_sales",
                "category": "margin_improvement",
                "priority": _priority_from_impact(impact, high_threshold=max(700, high_impact_threshold * 0.55), medium_threshold=max(150, medium_impact_threshold * 0.55)),
                "product": product,
                "economic_impact": impact,
                "title": "Mejorar margen en productos que sí venden",
                "action_label": "Ajustar precio o coste",
                "decision_theme": "Mejorar margen",
                "what_happens": f"{product} vende {sold:.0f} unidades, pero su margen estimado es solo del {margin_pct:.1f}%.",
                "problem_description": "El producto tiene demanda, pero aporta poco beneficio proporcional.",
                "probable_cause": "Precio de venta demasiado ajustado, coste de compra elevado o descuentos excesivos.",
                "why_it_matters": "Un producto con buena demanda pero margen bajo puede consumir capacidad comercial sin aportar suficiente beneficio.",
                "why_now": f"La demanda ya existe y el margen está por debajo del umbral configurado ({low_margin_threshold:.1f}%). Objetivo actual del negocio: {goal_label}.",
                "recommended_action": "Revisar precio de venta, negociar coste con proveedor o crear packs que eleven el margen medio de la cesta.",
                "first_step": "Calcular precio mínimo rentable y probar una subida selectiva o pack de mayor margen.",
                "expected_business_effect": "Mejorar rentabilidad sin depender necesariamente de vender más unidades.",
                "expected_benefit": f"Impacto conservador estimado de {impact:,.2f} € si se corrige parcialmente la brecha de margen.",
                "suggested_owner": "Dirección comercial / Pricing",
                "timeframe": "14 días",
                "affected_products": [product],
                "kpi_snapshot": snapshot,
            })

        if sold >= min_sales_for_restock and stock <= max(3, sold * stockout_sensitivity):
            impact = round(max(gross_profit, sold * max(row.get("unit_margin", 0) or 0, 0) * 0.5), 2)
            recommendations.append({
                "type": "stockout_risk",
                "category": "sales_protection",
                "priority": "high",
                "product": product,
                "economic_impact": impact,
                "title": "Reponer productos con alta demanda para evitar ventas perdidas",
                "action_label": "Reponer ahora",
                "decision_theme": "Evitar ventas perdidas",
                "what_happens": f"{product} ha vendido {sold:.0f} unidades y solo mantiene {stock:.0f} unidades en stock.",
                "problem_description": "La demanda es alta, pero el stock disponible es bajo.",
                "probable_cause": "Punto de reposición demasiado bajo o reposición no alineada con la velocidad real de venta.",
                "why_it_matters": "Si se agota el stock, el negocio puede perder ventas de un producto con demanda demostrada.",
                "why_now": f"El producto ya está vendiendo; con la sensibilidad de reposición configurada ({stockout_sensitivity:.0%}), la falta de stock puede convertir demanda real en ventas perdidas.",
                "recommended_action": "Reponer stock de forma prioritaria y definir un punto mínimo de reposición basado en la velocidad de ventas.",
                "first_step": "Lanzar pedido prioritario y configurar alerta de stock mínimo.",
                "expected_business_effect": "Proteger ventas y evitar perder demanda por falta de inventario.",
                "expected_benefit": f"Proteger aproximadamente {max(impact, 0):,.2f} € de margen asociado a productos con tracción comercial.",
                "suggested_owner": "Operaciones / Compras",
                "timeframe": "48 horas",
                "affected_products": [product],
                "kpi_snapshot": snapshot,
            })

    for item in recommendations:
        item["business_context"] = {
            "sector": profile.get("sector", "retail"),
            "sector_label": sector_label,
            "analysis_goal": profile.get("analysis_goal", "balanced"),
            "analysis_goal_label": goal_label,
            "target_margin_pct": target_margin_pct,
            "low_margin_pct": low_margin_threshold,
            "max_coverage_days": max_coverage_days,
        }

    recommendations = _add_decision_scores(recommendations)

    priority_order = {"high": 0, "medium": 1, "low": 2}
    recommendations.sort(
        key=lambda item: (
            priority_order.get(item["priority"], 9),
            -float(item.get("decision_score", 0)),
            -float(item.get("economic_impact", 0)),
        ),
    )

    return recommendations[:30]


def build_opportunity_groups(recommendations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Aggregate recommendations into executive decision categories."""
    grouped: Dict[str, Dict[str, Any]] = {}

    for category, config in CATEGORY_CONFIG.items():
        grouped[category] = {
            "category": category,
            "label": config["label"],
            "theme": config["theme"],
            "description": config["description"],
            "business_question": config["business_question"],
            "next_step": config["next_step"],
            "total_impact": 0.0,
            "items_count": 0,
            "high_priority_count": 0,
            "top_products": [],
            "average_confidence": 0.0,
            "priority": "low",
        }

    confidence_accumulator: Dict[str, List[float]] = defaultdict(list)

    for rec in recommendations:
        category = rec.get("category", "risk_reduction")
        if category not in grouped:
            category = "risk_reduction"

        group = grouped[category]
        group["total_impact"] += float(rec.get("economic_impact", 0) or 0)
        group["items_count"] += 1
        if rec.get("priority") == "high":
            group["high_priority_count"] += 1
        if rec.get("product") and len(group["top_products"]) < 5:
            group["top_products"].append(rec["product"])
        confidence_accumulator[category].append(float(rec.get("confidence_level", 75) or 75))

    output: List[Dict[str, Any]] = []
    for category, group in grouped.items():
        if group["items_count"] <= 0:
            continue
        group["total_impact"] = round(group["total_impact"], 2)
        group["average_confidence"] = round(sum(confidence_accumulator[category]) / len(confidence_accumulator[category])) if confidence_accumulator[category] else 0
        if group["high_priority_count"] > 0 or group["total_impact"] >= 1500:
            group["priority"] = "high"
        elif group["total_impact"] >= 300:
            group["priority"] = "medium"
        else:
            group["priority"] = "low"
        group["headline"] = f"{group['label']}: {group['items_count']} {'acciones' if group['items_count'] != 1 else 'acción'} con impacto económico."
        output.append(group)

    priority_order = {"high": 0, "medium": 1, "low": 2}
    output.sort(key=lambda item: (priority_order.get(item["priority"], 9), -item["total_impact"]))
    return output



CONSOLIDATED_TYPE_CONFIG: Dict[str, Dict[str, str]] = {
    "excess_stock": {
        "title": "Liberar caja reduciendo stock de baja rotación",
        "action_label": "Reducir sobrestock agrupado",
        "decision_theme": "Liberar caja",
        "problem_description": "Productos con cobertura muy superior a su demanda reciente.",
        "probable_cause": "Compras sobredimensionadas, previsión de demanda optimista o falta de ajuste del stock objetivo.",
        "recommended_action": "Pausar reposiciones, definir stock objetivo por rotación y activar una acción comercial para reducir cobertura.",
        "first_step": "Revisar los productos con más capital inmovilizado y bloquear nuevas compras hasta ajustar cobertura.",
        "expected_business_effect": "Liberar caja sin depender de vender más unidades.",
        "suggested_owner": "Compras / Operaciones",
        "timeframe": "30 días",
        "what_template": "Hay {count} productos con exceso de stock y baja rotación. Los principales son: {products}.",
        "why_template": "Estos productos concentran {impact:,.2f} € de capital inmovilizado que podría corregirse mediante reducción de stock objetivo, liquidación parcial o pausa de compras.",
    },
    "dead_stock": {
        "title": "Liquidar productos sin ventas recientes",
        "action_label": "Liquidar stock parado",
        "decision_theme": "Liberar caja",
        "problem_description": "Inventario con stock disponible pero sin ventas en el periodo analizado.",
        "probable_cause": "Demanda insuficiente, producto desactualizado, precio poco competitivo o falta de visibilidad comercial.",
        "recommended_action": "Crear una campaña de liquidación, revisar precio mínimo, valorar packs y pausar nuevas compras.",
        "first_step": "Crear una lista de liquidación con los productos de mayor valor inmovilizado.",
        "expected_business_effect": "Reducir inventario improductivo y recuperar liquidez.",
        "suggested_owner": "Dirección comercial / Compras",
        "timeframe": "7-14 días",
        "what_template": "Hay {count} productos con stock pero sin ventas recientes. Los principales son: {products}.",
        "why_template": "El stock parado suma {impact:,.2f} € de capital bloqueado que no está generando caja ni rotación.",
    },
    "low_margin_high_sales": {
        "title": "Mejorar margen en productos que ya venden",
        "action_label": "Ajustar precios y costes",
        "decision_theme": "Mejorar margen",
        "problem_description": "Productos con demanda, pero con margen inferior al objetivo configurado.",
        "probable_cause": "Costes de compra elevados, precios no actualizados, descuentos excesivos o mix comercial poco rentable.",
        "recommended_action": "Revisar precio mínimo rentable, negociar coste con proveedor y probar subidas selectivas o packs.",
        "first_step": "Priorizar los productos con mayor venta y menor margen para calcular precio mínimo rentable.",
        "expected_business_effect": "Aumentar rentabilidad sin depender de vender más unidades.",
        "suggested_owner": "Pricing / Dirección comercial",
        "timeframe": "14-30 días",
        "what_template": "Hay {count} productos con ventas relevantes y margen inferior al objetivo. Los principales son: {products}.",
        "why_template": "La mejora conservadora de margen suma {impact:,.2f} € de impacto potencial sobre productos que ya tienen demanda.",
    },
    "stockout_risk": {
        "title": "Reponer productos con alta demanda para evitar ventas perdidas",
        "action_label": "Proteger ventas con reposición",
        "decision_theme": "Evitar ventas perdidas",
        "problem_description": "Productos con demanda demostrada y stock bajo.",
        "probable_cause": "Puntos de reposición demasiado bajos o compras no alineadas con la velocidad de ventas.",
        "recommended_action": "Reponer stock prioritario, definir mínimos y configurar alertas de rotura.",
        "first_step": "Confirmar disponibilidad y lanzar pedido prioritario en los productos de mayor demanda.",
        "expected_business_effect": "Evitar ventas perdidas y proteger margen futuro.",
        "suggested_owner": "Operaciones / Compras",
        "timeframe": "48 horas - 7 días",
        "what_template": "Hay {count} productos con demanda y riesgo de quedarse sin stock. Los principales son: {products}.",
        "why_template": "La falta de stock podría comprometer aproximadamente {impact:,.2f} € de margen o ventas protegidas.",
    },
}


def _aggregate_priority(total_impact: float, high_count: int, count: int) -> str:
    if high_count > 0 or total_impact >= 1500 or count >= 5:
        return "high"
    if total_impact >= 300 or count >= 2:
        return "medium"
    return "low"


def build_consolidated_recommendations(recommendations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Group noisy product-level recommendations into executive decisions.

    Product-level evidence is preserved in detail_items/top_products, while the UI can show
    fewer, more useful decisions to a manager.
    """
    buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for rec in recommendations:
        buckets[str(rec.get("type") or "risk_reduction")].append(rec)

    consolidated: List[Dict[str, Any]] = []
    for rec_type, items in buckets.items():
        if not items:
            continue
        cfg = CONSOLIDATED_TYPE_CONFIG.get(rec_type)
        if not cfg:
            # Keep unknown recommendations but do not duplicate excessively.
            consolidated.extend(items[:2])
            continue

        items_sorted = sorted(items, key=lambda item: float(item.get("economic_impact", 0) or 0), reverse=True)
        total_impact = round(sum(float(item.get("economic_impact", 0) or 0) for item in items_sorted), 2)
        high_count = sum(1 for item in items_sorted if item.get("priority") == "high")
        avg_confidence = round(sum(float(item.get("confidence_level", 75) or 75) for item in items_sorted) / len(items_sorted))
        top_products = []
        for item in items_sorted[:8]:
            product = item.get("product")
            if product and product not in top_products:
                top_products.append(str(product))
        products_text = ", ".join(top_products[:4]) + ("…" if len(top_products) > 4 else "")
        first_item = items_sorted[0]
        priority = _aggregate_priority(total_impact, high_count, len(items_sorted))

        consolidated.append({
            "type": rec_type,
            "category": first_item.get("category", "risk_reduction"),
            "priority": priority,
            "product": f"{len(items_sorted)} productos afectados",
            "economic_impact": total_impact,
            "decision_score": int(max(0, min(100, round(sum(float(item.get("decision_score", 65) or 65) for item in items_sorted) / len(items_sorted))))),
            "confidence_level": int(max(60, min(96, avg_confidence))),
            "title": cfg["title"],
            "action_label": cfg["action_label"],
            "decision_theme": cfg["decision_theme"],
            "what_happens": cfg["what_template"].format(count=len(items_sorted), products=products_text, impact=total_impact),
            "problem_description": cfg["problem_description"],
            "probable_cause": cfg["probable_cause"],
            "why_it_matters": cfg["why_template"].format(count=len(items_sorted), products=products_text, impact=total_impact),
            "why_now": f"La decisión agrupa {len(items_sorted)} alertas similares y evita que el equipo trate cada producto de forma aislada.",
            "recommended_action": cfg["recommended_action"],
            "first_step": cfg["first_step"],
            "expected_business_effect": cfg["expected_business_effect"],
            "expected_benefit": f"Impacto económico estimado agrupado: {total_impact:,.2f} €. Es una estimación orientativa basada en coste, stock, ventas y margen disponibles.",
            "suggested_owner": cfg["suggested_owner"],
            "timeframe": cfg["timeframe"],
            "affected_products": top_products,
            "affected_products_count": len(items_sorted),
            "top_products": top_products[:6],
            "detail_items": [
                {
                    "product": item.get("product"),
                    "impact": float(item.get("economic_impact", 0) or 0),
                    "priority": item.get("priority"),
                    "confidence_level": item.get("confidence_level"),
                    "what_happens": item.get("what_happens"),
                    "kpi_snapshot": item.get("kpi_snapshot"),
                }
                for item in items_sorted[:10]
            ],
            "is_consolidated": True,
        })

    priority_order = {"high": 0, "medium": 1, "low": 2}
    consolidated.sort(key=lambda item: (priority_order.get(item.get("priority"), 9), -float(item.get("economic_impact", 0) or 0)))
    return consolidated[:8]


def build_trust_layer(summary: Dict[str, Any], recommendations: List[Dict[str, Any]], consolidated: List[Dict[str, Any]]) -> Dict[str, Any]:
    cash_release = float(summary.get("cash_release_potential", 0) or 0)
    margin = float(summary.get("margin_improvement_potential", 0) or 0)
    sales = float(summary.get("sales_protection_potential", 0) or 0)
    total = float(summary.get("potential_recoverable_benefit", 0) or 0)
    avg_conf = 0
    if recommendations:
        avg_conf = round(sum(float(rec.get("confidence_level", 75) or 75) for rec in recommendations) / len(recommendations))
    return {
        "headline": "Cómo se calcula el impacto económico",
        "confidence_level": int(max(60, min(96, avg_conf or 75))),
        "methodology": "Cálculo determinista basado en stock, coste, precio, ventas recientes, margen y cobertura. La IA solo ayuda a explicar y priorizar; no inventa los importes.",
        "components": [
            {
                "key": "cash_release",
                "label": "Caja liberable",
                "amount": round(cash_release, 2),
                "description": "Capital inmovilizado en stock de baja rotación o sin ventas. No es beneficio contable; es liquidez potencial que puede recuperarse reduciendo inventario.",
            },
            {
                "key": "margin_improvement",
                "label": "Margen mejorable",
                "amount": round(margin, 2),
                "description": "Estimación conservadora de mejora por precio, coste o pack en productos que venden pero tienen margen bajo.",
            },
            {
                "key": "sales_protection",
                "label": "Ventas protegidas",
                "amount": round(sales, 2),
                "description": "Margen o ventas que conviene proteger evitando roturas de stock en productos con demanda demostrada.",
            },
        ],
        "total": round(total, 2),
        "caveat": "Las cifras son estimaciones orientativas para priorizar decisiones. El resultado real depende de ejecución, demanda, descuentos, disponibilidad y negociación con proveedores.",
        "evidence": {
            "recommendations_analyzed": len(recommendations),
            "consolidated_decisions": len(consolidated),
            "high_priority_recommendations": sum(1 for rec in recommendations if rec.get("priority") == "high"),
        },
    }

def build_today_actions(recommendations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return the most actionable next steps for the executive homepage.

    Intended to work with consolidated recommendations so the user sees grouped
    decisions instead of repeated product-level alerts.
    """
    actions: List[Dict[str, Any]] = []
    for rec in recommendations[:6]:
        affected_count = int(rec.get("affected_products_count", 0) or len(rec.get("affected_products") or []) or 1)
        title = rec.get("title") or rec.get("action_label") or "Decisión recomendada"
        if affected_count > 1 and not str(title).lower().startswith(("liberar", "liquidar", "mejorar", "reponer")):
            title = f"{title} en {affected_count} productos"
        actions.append({
            "title": title,
            "decision": rec.get("title") or "Decisión recomendada",
            "impact": float(rec.get("economic_impact", 0) or 0),
            "priority": rec.get("priority", "medium"),
            "category": rec.get("category", "risk_reduction"),
            "area": rec.get("decision_theme") or CATEGORY_CONFIG.get(rec.get("category", "risk_reduction"), CATEGORY_CONFIG["risk_reduction"])["label"],
            "reason": rec.get("why_it_matters") or rec.get("why_now") or "Tiene impacto económico directo.",
            "first_step": rec.get("first_step") or rec.get("recommended_action") or "Revisar detalle de la recomendación.",
            "confidence_level": rec.get("confidence_level", 75),
            "related_products": rec.get("affected_products") or [rec.get("product")],
            "recommendation_type": rec.get("type"),
            "affected_products_count": affected_count,
        })
    return actions[:4]


def build_action_plan(recommendations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Create an executive action plan grouped by business objective.

    Kept for frontend compatibility. The richer version is build_opportunity_groups().
    """
    plan = []
    for group in build_opportunity_groups(recommendations):
        plan.append({
            "title": group["label"],
            "description": group["description"],
            "recommended_next_step": group["next_step"],
            "priority": group["priority"],
            "total_impact": group["total_impact"],
            "items_count": group["items_count"],
        })
    return plan


def build_executive_briefing(summary: Dict[str, Any], recommendations: List[Dict[str, Any]], groups: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Generate short business-oriented copy without relying on an LLM."""
    total_impact = float(summary.get("potential_recoverable_benefit", 0) or 0)
    products_count = int(summary.get("products_count", 0) or 0)
    top_group = groups[0] if groups else None
    top_rec = recommendations[0] if recommendations else None

    if top_group:
        headline = f"Mayor oportunidad: {top_group['label'].lower()}"
        message = (
            f"Se analizaron {products_count} productos y se detectó un impacto económico potencial de "
            f"{total_impact:,.2f} €. La prioridad principal es {top_group['label'].lower()}, "
            f"con {top_group['items_count']} {'acciones identificadas' if top_group['items_count'] != 1 else 'acción identificada'}."
        )
    else:
        headline = "Análisis completado"
        message = f"Se analizaron {products_count} productos. No se detectan alertas críticas con los datos disponibles."

    ai_insight = "No hay suficientes oportunidades para priorizar una acción concreta."
    if top_rec:
        ai_insight = (
            f"La primera decisión recomendada es: {top_rec.get('title')}. "
            f"Impacto estimado: {float(top_rec.get('economic_impact', 0) or 0):,.2f} €. "
            f"Primer paso: {top_rec.get('first_step') or top_rec.get('recommended_action')}"
        )

    return {
        "headline": headline,
        "message": message,
        "ai_insight": ai_insight,
        "reading_time": "2 minutos",
        "top_decision": top_rec.get("title") if top_rec else None,
        "top_decision_impact": float(top_rec.get("economic_impact", 0) or 0) if top_rec else 0,
    }
