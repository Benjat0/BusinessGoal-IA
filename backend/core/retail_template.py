from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

import pandas as pd

from .utils import normalize_text


TEMPLATE_KEY = "retail_ecommerce"
TEMPLATE_LABEL = "Retail / ecommerce"

CONCEPT_ALIASES: Dict[str, List[str]] = {
    "product_identity": [
        "sku",
        "product_id",
        "producto",
        "product_name",
        "nombre_producto",
        "referencia",
        "codigo",
        "ean",
        "barcode",
    ],
    "stock": [
        "stock",
        "unidades_stock",
        "stock_actual",
        "inventario",
        "unidades_disponibles",
        "on_hand",
        "available_stock",
        "stock_units",
    ],
    "sales": [
        "ventas",
        "unidades_vendidas",
        "unidades_90d",
        "sales_units",
        "quantity_sold",
        "qty_sold",
        "revenue",
        "ingresos",
        "facturacion",
        "units_sold",
    ],
    "cost_price": [
        "coste",
        "costo",
        "unit_cost",
        "purchase_price",
        "precio_coste",
        "precio_compra",
        "price",
        "precio",
        "sale_price",
        "precio_venta",
    ],
    "margin": [
        "margen",
        "gross_margin",
        "margen_bruto",
        "gross_margin_pct",
        "margin_pct",
    ],
    "category_supplier": [
        "categoria",
        "category",
        "familia",
        "marca",
        "brand",
        "proveedor",
        "supplier",
    ],
    "dates": [
        "fecha",
        "date",
        "order_date",
        "sale_date",
        "periodo",
        "month",
        "last_sale_date",
        "purchase_date",
    ],
}

BUSINESS_QUESTIONS = [
    "¿Dónde tengo caja bloqueada en inventario?",
    "¿Qué productos tienen margen mejorable?",
    "¿Qué productos tienen riesgo de rotura de stock?",
    "¿Qué productos combinan ventas bajas y stock alto?",
    "¿Qué decisiones económicas debería priorizar?",
]


def _empty_concepts() -> Dict[str, List[str]]:
    return {concept: [] for concept in CONCEPT_ALIASES}


def _safe_low(warnings: Optional[List[str]] = None) -> Dict[str, Any]:
    return {
        "template_key": TEMPLATE_KEY,
        "label": TEMPLATE_LABEL,
        "fit_score": 0,
        "confidence": "LOW",
        "detected_concepts": _empty_concepts(),
        "missing_concepts": [
            "identidad de producto",
            "stock",
            "ventas",
            "coste/precio/margen",
            "categoría/proveedor",
            "fecha/periodo",
        ],
        "recommended_files": [
            "Archivo de inventario actual",
            "Archivo de ventas recientes",
            "Archivo de catálogo con costes/precios",
            "Archivo de productos/categorías/proveedor",
        ],
        "business_questions_supported": BUSINESS_QUESTIONS,
        "data_readiness_summary": (
            "Faltan columnas suficientes para evaluar el encaje con una plantilla retail/ecommerce."
        ),
        "warnings": warnings or [],
    }


def _series_has_values(series: pd.Series) -> bool:
    if series.empty:
        return False
    non_empty = series.dropna().astype(str).str.strip()
    return bool((non_empty != "").any())


def _add_candidate(candidates: List[str], seen: set[str], value: Any) -> None:
    if value is None:
        return
    label = str(value).strip()
    if not label:
        return
    key = label.casefold()
    if key in seen:
        return
    seen.add(key)
    candidates.append(label)


def _collect_candidates(
    *,
    detected_columns: Iterable[Any],
    column_mapping: Optional[Dict[str, Any]],
    normalized_df: Optional[pd.DataFrame],
) -> List[str]:
    candidates: List[str] = []
    seen: set[str] = set()

    for column in detected_columns or []:
        _add_candidate(candidates, seen, column)

    if column_mapping:
        for canonical_field, source_column in column_mapping.items():
            if source_column:
                _add_candidate(candidates, seen, source_column)
                _add_candidate(candidates, seen, canonical_field)

    if normalized_df is not None:
        for column in normalized_df.columns:
            try:
                if _series_has_values(normalized_df[column]):
                    _add_candidate(candidates, seen, column)
            except Exception:
                _add_candidate(candidates, seen, column)

    return candidates


def _candidate_variants(label: str) -> List[str]:
    variants = [normalize_text(label)]
    if ":" in label:
        variants.append(normalize_text(label.split(":", 1)[1]))
    return [variant for variant in variants if variant]


def _matches_alias(normalized_label: str, normalized_aliases: set[str]) -> bool:
    if normalized_label in normalized_aliases:
        return True

    tokens = normalized_label.split("_")
    for alias in normalized_aliases:
        alias_tokens = alias.split("_")
        if len(alias_tokens) == 1 and alias in tokens:
            return True
        if len(alias_tokens) > 1 and (
            normalized_label.startswith(f"{alias}_")
            or normalized_label.endswith(f"_{alias}")
            or f"_{alias}_" in f"_{normalized_label}_"
        ):
            return True
    return False


def _detect_concepts(candidates: List[str]) -> Dict[str, List[str]]:
    detected = _empty_concepts()
    concept_seen = {concept: set() for concept in CONCEPT_ALIASES}
    normalized_aliases = {
        concept: {normalize_text(alias) for alias in aliases}
        for concept, aliases in CONCEPT_ALIASES.items()
    }

    for label in candidates:
        variants = _candidate_variants(label)
        for concept, aliases in normalized_aliases.items():
            if any(_matches_alias(variant, aliases) for variant in variants):
                key = label.casefold()
                if key not in concept_seen[concept]:
                    concept_seen[concept].add(key)
                    detected[concept].append(label)

    return detected


def _missing_concepts(detected: Dict[str, List[str]]) -> List[str]:
    missing: List[str] = []
    if not detected["product_identity"]:
        missing.append("identidad de producto")
    if not detected["stock"]:
        missing.append("stock")
    if not detected["sales"]:
        missing.append("ventas")
    if not detected["cost_price"] and not detected["margin"]:
        missing.append("coste/precio/margen")
    if not detected["category_supplier"]:
        missing.append("categoría/proveedor")
    if not detected["dates"]:
        missing.append("fecha/periodo")
    return missing


def _recommended_files(missing: List[str]) -> List[str]:
    files: List[str] = []

    def add(label: str) -> None:
        if label not in files:
            files.append(label)

    if "stock" in missing:
        add("Archivo de inventario actual")
    if "ventas" in missing or "fecha/periodo" in missing:
        add("Archivo de ventas recientes")
    if "coste/precio/margen" in missing:
        add("Archivo de catálogo con costes/precios")
    if "identidad de producto" in missing or "categoría/proveedor" in missing:
        add("Archivo de productos/categorías/proveedor")
    return files


def _score(detected: Dict[str, List[str]]) -> int:
    score = 0
    if detected["product_identity"]:
        score += 20
    if detected["stock"]:
        score += 20
    if detected["sales"]:
        score += 20
    if detected["cost_price"] or detected["margin"]:
        score += 20
    if detected["category_supplier"]:
        score += 10
    if detected["dates"]:
        score += 10
    return min(100, score)


def _confidence(score: int) -> str:
    if score >= 75:
        return "HIGH"
    if score >= 45:
        return "MEDIUM"
    return "LOW"


def _summary(confidence: str, missing: List[str]) -> str:
    if confidence == "HIGH":
        return "El análisis encaja bien con una plantilla retail/ecommerce para revisar stock, ventas y margen."
    if confidence == "MEDIUM":
        return (
            "El análisis encaja parcialmente con retail/ecommerce. Completar los datos faltantes mejoraría "
            "la lectura de inventario, ventas y economía de producto."
        )
    if missing:
        return f"Faltan datos clave para una lectura retail/ecommerce: {', '.join(missing)}."
    return "La señal retail/ecommerce es limitada con las columnas detectadas."


def _warnings(detected: Dict[str, List[str]], missing: List[str]) -> List[str]:
    warnings: List[str] = []
    if "identidad de producto" in missing:
        warnings.append("Falta una columna clara de SKU, referencia o producto para unir fuentes.")
    if "stock" in missing:
        warnings.append("Sin stock actual no se puede estimar caja bloqueada ni riesgo de disponibilidad.")
    if "ventas" in missing:
        warnings.append("Sin ventas recientes la lectura de demanda será limitada.")
    if "coste/precio/margen" in missing:
        warnings.append("Sin coste, precio o margen no se puede estimar margen mejorable.")
    if detected["sales"] and not detected["dates"]:
        warnings.append("Hay señal de ventas, pero falta fecha o periodo para contextualizar demanda reciente.")
    return warnings


def detect_retail_template_fit(
    detected_columns: Iterable[Any],
    column_mapping: Optional[Dict[str, Any]],
    normalized_df: Optional[pd.DataFrame],
) -> Dict[str, Any]:
    try:
        candidates = _collect_candidates(
            detected_columns=detected_columns,
            column_mapping=column_mapping,
            normalized_df=normalized_df,
        )
        detected = _detect_concepts(candidates)
        score = _score(detected)
        confidence = _confidence(score)
        missing = _missing_concepts(detected)

        return {
            "template_key": TEMPLATE_KEY,
            "label": TEMPLATE_LABEL,
            "fit_score": score,
            "confidence": confidence,
            "detected_concepts": detected,
            "missing_concepts": missing,
            "recommended_files": _recommended_files(missing),
            "business_questions_supported": BUSINESS_QUESTIONS,
            "data_readiness_summary": _summary(confidence, missing),
            "warnings": _warnings(detected, missing),
        }
    except Exception as exc:
        return _safe_low([f"No se pudo evaluar la plantilla retail/ecommerce: {exc}"])
