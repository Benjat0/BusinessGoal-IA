from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

import pandas as pd

from .utils import normalize_text


CANONICAL_FIELDS: Dict[str, List[str]] = {
    "sku": [
        "sku", "codigo", "cod", "cod_producto", "codigo_producto", "ref", "referencia",
        "id_producto", "product_id", "item_id", "ean", "barcode", "barras"
    ],
    "product_name": [
        "producto", "producto_nombre", "nombre", "descripcion", "articulo", "item", "product",
        "product_name", "name", "description"
    ],
    "category": [
        "categoria", "familia", "grupo", "linea", "tipo", "category", "family", "segmento"
    ],
    "supplier": [
        "proveedor", "supplier", "vendor", "fabricante", "marca", "brand"
    ],
    "stock_units": [
        "stock", "existencias", "inventario", "unidades_stock", "qty_stock", "quantity_on_hand",
        "available", "disponible", "cantidad", "units_stock"
    ],
    "unit_cost": [
        "coste", "costo", "coste_unitario", "costo_unitario", "precio_compra", "purchase_price",
        "unit_cost", "cost", "cost_price", "precio_coste"
    ],
    "sale_price": [
        "precio", "pvp", "precio_venta", "sale_price", "selling_price", "price", "venta_unitaria"
    ],
    "units_sold": [
        "ventas", "unidades_vendidas", "uds_vendidas", "cantidad_vendida", "sold_units",
        "units_sold", "qty_sold", "sales_units", "vendido"
    ],
    "revenue": [
        "facturacion", "ingresos", "ventas_euros", "importe_ventas", "revenue", "sales_amount",
        "total_sales", "importe"
    ],
    "last_sale_date": [
        "ultima_venta", "fecha_ultima_venta", "last_sale", "last_sale_date", "fecha_venta"
    ],
    "purchase_date": [
        "fecha_compra", "fecha_entrada", "purchase_date", "entry_date", "fecha_alta"
    ],
}


@dataclass
class MappingResult:
    mapping: Dict[str, Optional[str]]
    confidence: Dict[str, float]
    detected_columns: List[str]
    missing_required_fields: List[str]


def detect_columns(df: pd.DataFrame) -> MappingResult:
    """Detect canonical business fields from arbitrary spreadsheet columns.

    This is intentionally deterministic for the MVP. An LLM layer can be added later
    for ambiguous cases, but this keeps the first version auditable.
    """
    normalized_columns = {normalize_text(col): col for col in df.columns}

    mapping: Dict[str, Optional[str]] = {}
    confidence: Dict[str, float] = {}

    for canonical_field, aliases in CANONICAL_FIELDS.items():
        selected_column = None
        selected_score = 0.0

        normalized_aliases = [normalize_text(alias) for alias in aliases]

        for norm_col, original_col in normalized_columns.items():
            if norm_col in normalized_aliases:
                selected_column = original_col
                selected_score = 1.0
                break

            partial_matches = [alias for alias in normalized_aliases if alias in norm_col or norm_col in alias]
            if partial_matches and selected_score < 0.75:
                selected_column = original_col
                selected_score = 0.75

        mapping[canonical_field] = selected_column
        confidence[canonical_field] = selected_score

    required = ["product_name", "stock_units"]
    missing_required = [field for field in required if not mapping.get(field)]

    return MappingResult(
        mapping=mapping,
        confidence=confidence,
        detected_columns=list(df.columns),
        missing_required_fields=missing_required,
    )


def normalize_dataframe(df: pd.DataFrame, mapping: Dict[str, Optional[str]]) -> pd.DataFrame:
    """Create a canonical dataframe with stable internal field names."""
    normalized = pd.DataFrame()

    for canonical_field, source_column in mapping.items():
        if source_column and source_column in df.columns:
            normalized[canonical_field] = df[source_column]
        else:
            normalized[canonical_field] = None

    return normalized
