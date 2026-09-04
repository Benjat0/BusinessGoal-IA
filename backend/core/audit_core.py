from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional


AUDIT_CORE_VERSION = "v21.0"

# The Audit Core deliberately reports what is and is not assessable. It does
# not create a global company-health score from a partial retail dataset.
AUDIT_AREAS = (
    {
        "key": "data_quality",
        "label": "Calidad y cobertura de datos",
        "required_metrics": (),
        "required_fields": (),
    },
    {
        "key": "profitability",
        "label": "Rentabilidad de catálogo",
        "required_metrics": ("revenue", "gross_profit_estimated"),
        "required_fields": ("unit_cost", "sale_price"),
    },
    {
        "key": "inventory",
        "label": "Inventario y capital",
        "required_metrics": ("inventory_value",),
        "required_fields": ("stock_units", "unit_cost"),
    },
    {
        "key": "sales",
        "label": "Actividad comercial",
        "required_metrics": ("units_sold", "revenue"),
        "required_fields": ("units_sold",),
    },
    {
        "key": "customers",
        "label": "Clientes y concentración",
        "required_metrics": (),
        "required_fields": ("customer",),
    },
    {
        "key": "operations",
        "label": "Operaciones y capacidad",
        "required_metrics": (),
        "required_fields": ("capacity",),
    },
)


def _number(value: Any, default: float = 0.0) -> float:
    if isinstance(value, bool):
        return default
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return default
    return numeric if numeric == numeric else default


def _bounded_pct(value: Any) -> float:
    return max(0.0, min(1.0, _number(value)))


def _score_label(score: int) -> str:
    if score >= 85:
        return "HIGH"
    if score >= 65:
        return "MEDIUM"
    return "LOW"


def _mapped_fields(column_mapping: Dict[str, Optional[str]]) -> set[str]:
    return {
        field
        for field, source in (column_mapping or {}).items()
        if isinstance(source, str) and source.strip()
    }


def _mapped_confidence(
    column_mapping: Dict[str, Optional[str]],
    mapping_confidence: Dict[str, Any],
) -> int:
    mapped = _mapped_fields(column_mapping)
    if not mapped:
        return 0
    values = [_bounded_pct((mapping_confidence or {}).get(field)) for field in mapped]
    return int(round(sum(values) / len(values) * 100))


def _metrics_score(metric_coverage: Dict[str, Any]) -> int:
    relevant = (
        "inventory_value",
        "revenue",
        "gross_profit_estimated",
        "stock_coverage_days",
        "stock_turnover_90d",
    )
    values = [_bounded_pct((metric_coverage or {}).get(key)) for key in relevant]
    return int(round(sum(values) / len(values) * 100))


def _data_quality_score(
    validation: Dict[str, Any],
    column_mapping: Dict[str, Optional[str]],
    mapping_confidence: Dict[str, Any],
    metric_coverage: Dict[str, Any],
    merge_summary: Optional[Dict[str, Any]],
) -> tuple[int, Dict[str, int]]:
    file_quality = int(round(max(0.0, min(100.0, _number((validation or {}).get("quality_score"))))))
    mapping_quality = _mapped_confidence(column_mapping, mapping_confidence)
    metrics_quality = _metrics_score(metric_coverage)
    merge_quality = (
        int(round(max(0.0, min(100.0, _number((merge_summary or {}).get("merge_quality_score"))))))
        if merge_summary
        else 100
    )

    score = int(round(
        file_quality * 0.30
        + mapping_quality * 0.25
        + metrics_quality * 0.35
        + merge_quality * 0.10
    ))
    return score, {
        "file_validation": file_quality,
        "field_mapping": mapping_quality,
        "metric_coverage": metrics_quality,
        "file_linkage": merge_quality,
    }


def _area_status(
    area: Dict[str, Any],
    mapped_fields: set[str],
    metric_coverage: Dict[str, Any],
) -> tuple[str, int, List[str], List[str]]:
    required_fields = tuple(area["required_fields"])
    required_metrics = tuple(area["required_metrics"])

    missing_fields = [field for field in required_fields if field not in mapped_fields]
    observed_metrics = [
        _bounded_pct((metric_coverage or {}).get(metric))
        for metric in required_metrics
    ]
    missing_metrics = [
        metric
        for metric, coverage in zip(required_metrics, observed_metrics)
        if coverage < 0.5
    ]

    if area["key"] == "data_quality":
        return "ASSESSED", 100, [], []

    if not required_fields and not required_metrics:
        return "NOT_AVAILABLE", 0, list(required_fields), list(required_metrics)

    if missing_fields or missing_metrics:
        return "NOT_ASSESSED", 0, missing_fields, missing_metrics

    coverage_values: Iterable[float] = observed_metrics or (1.0,)
    confidence = int(round(sum(coverage_values) / len(tuple(coverage_values)) * 100))
    return "ASSESSED", confidence, [], []


def _area_next_inputs(area_key: str) -> List[str]:
    mapping = {
        "profitability": [
            "Coste unitario o coste de compra",
            "Precio de venta o ingresos por producto",
            "Ventas por producto y periodo",
        ],
        "inventory": [
            "Stock actual por producto",
            "Coste unitario o valor de inventario",
            "Ventas recientes por producto",
        ],
        "sales": [
            "Unidades vendidas o ingresos por producto",
            "Fecha o periodo de venta",
        ],
        "customers": [
            "Cliente o identificador de cliente",
            "Ingresos, margen o pedidos por cliente",
            "Periodo de cada operación",
        ],
        "operations": [
            "Capacidad disponible",
            "Horas, producción, entregas o tiempos de proceso",
            "Coste operativo y periodo",
        ],
    }
    return mapping.get(area_key, [])


def build_audit_core(
    *,
    validation: Optional[Dict[str, Any]],
    column_mapping: Optional[Dict[str, Optional[str]]],
    mapping_confidence: Optional[Dict[str, Any]],
    metric_coverage: Optional[Dict[str, Any]],
    retail_template_fit: Optional[Dict[str, Any]] = None,
    merge_summary: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build an honest, reusable audit-scope and data-readiness contract.

    This first Audit Core does not infer a company-wide state. It makes the
    coverage of the active dataset explicit and enables only the areas for
    which the data supports a minimum evidence threshold.
    """
    validation = validation or {}
    column_mapping = column_mapping or {}
    mapping_confidence = mapping_confidence or {}
    metric_coverage = metric_coverage or {}
    mapped = _mapped_fields(column_mapping)

    readiness_score, readiness_components = _data_quality_score(
        validation,
        column_mapping,
        mapping_confidence,
        metric_coverage,
        merge_summary,
    )

    assessed_areas: List[Dict[str, Any]] = []
    unavailable_areas: List[str] = []
    recommended_inputs: List[str] = []

    for area in AUDIT_AREAS:
        status, confidence, missing_fields, missing_metrics = _area_status(
            area,
            mapped,
            metric_coverage,
        )
        next_inputs = _area_next_inputs(area["key"]) if status != "ASSESSED" else []
        assessed_areas.append(
            {
                "key": area["key"],
                "label": area["label"],
                "status": status,
                "confidence": confidence,
                "missing_fields": missing_fields,
                "missing_metrics": missing_metrics,
                "next_inputs": next_inputs,
            }
        )
        if status != "ASSESSED":
            unavailable_areas.append(area["key"])
            recommended_inputs.extend(next_inputs)

    deduplicated_inputs = list(dict.fromkeys(recommended_inputs))
    assessed_count = sum(area["status"] == "ASSESSED" for area in assessed_areas)
    scope_status = "PARTIAL_AUDIT" if unavailable_areas else "SUPPORTED_SCOPE"

    limitations = [
        "El Audit Core v21.0 no calcula una puntuación global de salud empresarial con datos parciales.",
        "Las áreas no evaluadas no deben interpretarse como ausencia de problemas.",
        "Las decisiones económicas mantienen estimaciones y supuestos; no representan resultados garantizados.",
    ]
    if retail_template_fit and retail_template_fit.get("confidence") != "HIGH":
        limitations.append("El encaje con la plantilla retail/ecommerce no es completo; revisa los campos recomendados antes de ejecutar decisiones.")
    if not merge_summary:
        limitations.append("El análisis se basa en una única fuente; no se ha validado el cruce entre inventario, ventas y catálogo.")

    return {
        "version": AUDIT_CORE_VERSION,
        "scope_status": scope_status,
        "scope_label": "Auditoría parcial basada en los datos disponibles" if scope_status == "PARTIAL_AUDIT" else "Auditoría dentro del alcance de datos disponible",
        "data_readiness": {
            "score": readiness_score,
            "confidence": _score_label(readiness_score),
            "components": readiness_components,
            "summary": (
                f"Se pueden evaluar {assessed_count} de {len(assessed_areas)} áreas del Audit Core "
                f"con los datos actuales."
            ),
        },
        "business_health_score": {
            "available": False,
            "score": None,
            "reason": "No se calcula una salud global hasta que existan datos suficientes y reglas específicas para todas las áreas relevantes.",
        },
        "areas": assessed_areas,
        "assessed_area_count": assessed_count,
        "total_area_count": len(assessed_areas),
        "recommended_next_inputs": deduplicated_inputs,
        "limitations": limitations,
    }
