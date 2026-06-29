from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import pandas as pd


FIELD_LABELS: Dict[str, str] = {
    "sku": "SKU / referencia",
    "product_name": "Producto",
    "category": "Categoría",
    "supplier": "Proveedor",
    "stock_units": "Stock",
    "unit_cost": "Coste unitario",
    "sale_price": "Precio venta",
    "units_sold": "Unidades vendidas",
    "revenue": "Ingresos / facturación",
    "last_sale_date": "Fecha última venta",
    "purchase_date": "Fecha compra",
}

FIELD_DESCRIPTIONS: Dict[str, str] = {
    "sku": "Identificador único del producto.",
    "product_name": "Nombre o descripción comercial del producto.",
    "category": "Familia, categoría o línea de producto.",
    "supplier": "Proveedor, fabricante o marca.",
    "stock_units": "Unidades disponibles en inventario.",
    "unit_cost": "Coste de compra o coste medio unitario.",
    "sale_price": "Precio de venta unitario.",
    "units_sold": "Unidades vendidas en el periodo analizado.",
    "revenue": "Ingresos generados por producto.",
    "last_sale_date": "Última fecha en la que se vendió el producto.",
    "purchase_date": "Fecha de compra, entrada o alta del producto.",
}

FIELD_OPTIONS = [
    {"value": "ignore", "label": "Ignorar columna"},
    *[{"value": key, "label": value} for key, value in FIELD_LABELS.items()],
]

REQUIRED_BY_FILE_TYPE: Dict[str, List[str]] = {
    "combined": ["product_name", "stock_units", "unit_cost", "sale_price", "units_sold"],
    "inventory": ["product_name", "stock_units"],
    "sales": ["product_name", "units_sold"],
}

RECOMMENDED_BY_FILE_TYPE: Dict[str, List[str]] = {
    "combined": ["sku", "category", "supplier", "last_sale_date"],
    "inventory": ["sku", "category", "supplier", "unit_cost", "sale_price"],
    "sales": ["sku", "sale_price", "revenue", "last_sale_date"],
}

FILE_TYPE_LABELS: Dict[str, str] = {
    "combined": "Archivo combinado",
    "inventory": "Inventario",
    "sales": "Ventas",
}


def _present_fields(mapping: Dict[str, Optional[str]]) -> List[str]:
    return [field for field, source in mapping.items() if source]


def infer_file_type(mapping: Dict[str, Optional[str]]) -> str:
    present = set(_present_fields(mapping))
    has_inventory = "stock_units" in present
    has_sales = "units_sold" in present or "revenue" in present
    has_pricing = "unit_cost" in present or "sale_price" in present

    if has_inventory and (has_sales or has_pricing):
        return "combined"
    if has_sales and not has_inventory:
        return "sales"
    return "inventory"


def build_reverse_mapping(mapping: Dict[str, Optional[str]]) -> Dict[str, str]:
    reverse: Dict[str, str] = {}
    for field, source in mapping.items():
        if source:
            reverse[str(source)] = field
    return reverse


def _count_empty_values(df: pd.DataFrame, column: Optional[str]) -> int:
    if not column or column not in df.columns:
        return 0
    return int(df[column].isna().sum())


def _numeric_issue_count(df: pd.DataFrame, column: Optional[str]) -> int:
    if not column or column not in df.columns:
        return 0
    series = df[column].dropna().astype(str).str.strip()
    if series.empty:
        return 0
    cleaned = (
        series
        .str.replace("€", "", regex=False)
        .str.replace(" ", "", regex=False)
        .str.replace(".", "", regex=False)
        .str.replace(",", ".", regex=False)
    )
    numeric = pd.to_numeric(cleaned, errors="coerce")
    return int(numeric.isna().sum())


def validate_file(df: pd.DataFrame, mapping: Dict[str, Optional[str]], confidence: Dict[str, float], file_type: Optional[str] = None) -> Dict[str, Any]:
    selected_type = file_type or infer_file_type(mapping)
    required = REQUIRED_BY_FILE_TYPE.get(selected_type, REQUIRED_BY_FILE_TYPE["combined"])
    recommended = RECOMMENDED_BY_FILE_TYPE.get(selected_type, [])
    present = set(_present_fields(mapping))

    missing_required = [field for field in required if field not in present]
    missing_recommended = [field for field in recommended if field not in present]
    low_confidence_fields = [field for field, value in confidence.items() if mapping.get(field) and value < 0.8]

    issues: List[Dict[str, Any]] = []
    positives: List[str] = []

    if not missing_required:
        positives.append("Los campos mínimos para este tipo de archivo están detectados.")
    if "product_name" in present:
        positives.append("Producto detectado correctamente.")
    if "stock_units" in present:
        positives.append("Stock detectado correctamente.")
    if "units_sold" in present:
        positives.append("Ventas detectadas correctamente.")
    if "unit_cost" in present and "sale_price" in present:
        positives.append("Coste y precio detectados para calcular margen.")

    for field in missing_required:
        issues.append({
            "severity": "error",
            "field": field,
            "title": f"Falta {FIELD_LABELS.get(field, field)}",
            "message": "Este campo es necesario para generar un análisis fiable con este tipo de archivo.",
        })

    for field in missing_recommended[:4]:
        issues.append({
            "severity": "warning",
            "field": field,
            "title": f"No se detectó {FIELD_LABELS.get(field, field)}",
            "message": "El análisis puede continuar, pero las recomendaciones serán más precisas si este dato está disponible.",
        })

    for field in low_confidence_fields:
        issues.append({
            "severity": "warning",
            "field": field,
            "title": f"Mapeo con confianza media: {FIELD_LABELS.get(field, field)}",
            "message": "Conviene confirmar que esta columna representa realmente el campo detectado.",
        })

    numeric_fields = ["stock_units", "unit_cost", "sale_price", "units_sold", "revenue"]
    for field in numeric_fields:
        source = mapping.get(field)
        invalid_count = _numeric_issue_count(df, source)
        if invalid_count:
            issues.append({
                "severity": "warning",
                "field": field,
                "title": f"Valores no numéricos en {FIELD_LABELS.get(field, field)}",
                "message": f"Se han encontrado {invalid_count} valores que podrían no convertirse correctamente a número.",
            })

    empty_product_names = _count_empty_values(df, mapping.get("product_name"))
    if empty_product_names:
        issues.append({
            "severity": "warning",
            "field": "product_name",
            "title": "Productos sin nombre",
            "message": f"Hay {empty_product_names} filas sin nombre de producto.",
        })

    detected_count = len(present)
    total_confidence = sum(float(confidence.get(field, 0) or 0) for field in present)
    average_confidence = (total_confidence / detected_count) if detected_count else 0
    coverage_score = min(100, (detected_count / 8) * 100)
    required_penalty = len(missing_required) * 22
    warning_penalty = min(18, len([i for i in issues if i["severity"] == "warning"]) * 4)
    quality_score = round(max(0, min(100, coverage_score * 0.45 + average_confidence * 100 * 0.55 - required_penalty - warning_penalty)))

    if quality_score >= 85:
        quality_label = "Alta"
        quality_tone = "positive"
    elif quality_score >= 65:
        quality_label = "Media"
        quality_tone = "warning"
    else:
        quality_label = "Baja"
        quality_tone = "critical"

    return {
        "file_type": selected_type,
        "file_type_label": FILE_TYPE_LABELS.get(selected_type, selected_type),
        "quality_score": quality_score,
        "quality_label": quality_label,
        "quality_tone": quality_tone,
        "required_fields": required,
        "recommended_fields": recommended,
        "missing_required_fields": missing_required,
        "missing_recommended_fields": missing_recommended,
        "issues": issues[:12],
        "positives": positives[:8],
        "can_analyze": len(missing_required) == 0,
    }
