from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from .field_mapper import CANONICAL_FIELDS, detect_columns, normalize_dataframe
from .file_validator import build_reverse_mapping, infer_file_type, validate_file
from .utils import normalize_text, to_number


@dataclass
class PreparedFile:
    role: str
    file_name: str
    rows: int
    columns: int
    original_df: pd.DataFrame
    mapping: Dict[str, Optional[str]]
    confidence: Dict[str, float]
    detected_columns: List[str]
    validation: Dict[str, Any]
    normalized_df: pd.DataFrame


def build_join_key(df: pd.DataFrame) -> pd.Series:
    """Create a stable product key for joining inventory and sales files."""
    if "sku" in df.columns and df["sku"].notna().any():
        sku = df["sku"].fillna("").astype(str).map(normalize_text)
    else:
        sku = pd.Series(["" for _ in range(len(df))], index=df.index)

    name = df.get("product_name", pd.Series(["" for _ in range(len(df))], index=df.index)).fillna("").astype(str).map(normalize_text)
    key = sku.where(sku != "", name)
    return key


def prepare_business_file(
    *,
    role: str,
    file_name: str,
    df: pd.DataFrame,
    mapping_override: Optional[Dict[str, Optional[str]]] = None,
) -> PreparedFile:
    mapping_result = detect_columns(df)
    mapping = mapping_result.mapping.copy()
    if mapping_override:
        for field in CANONICAL_FIELDS.keys():
            value = mapping_override.get(field)
            mapping[field] = str(value) if value not in (None, "", "ignore") else None

    selected_type = role if role in {"combined", "inventory", "sales"} else infer_file_type(mapping)
    validation = validate_file(df, mapping, mapping_result.confidence, selected_type)
    normalized = normalize_dataframe(df, mapping)

    return PreparedFile(
        role=selected_type,
        file_name=file_name,
        rows=int(df.shape[0]),
        columns=int(df.shape[1]),
        original_df=df,
        mapping=mapping,
        confidence=mapping_result.confidence,
        detected_columns=mapping_result.detected_columns,
        validation=validation,
        normalized_df=normalized,
    )


def _aggregate_sales(sales: pd.DataFrame) -> pd.DataFrame:
    sales = sales.copy()
    sales["_join_key"] = build_join_key(sales)
    sales = sales[sales["_join_key"].astype(str).str.len() > 0]

    if sales.empty:
        return pd.DataFrame(columns=["_join_key", "units_sold", "revenue", "last_sale_date"])

    sales["units_sold_num"] = to_number(sales.get("units_sold", pd.Series(dtype="object")))
    sales["revenue_num"] = to_number(sales.get("revenue", pd.Series(dtype="object")))
    sales["sale_price_num"] = to_number(sales.get("sale_price", pd.Series(dtype="object")))

    # If revenue is not present, estimate it from units sold and sale price when possible.
    missing_revenue = sales["revenue_num"] <= 0
    sales.loc[missing_revenue, "revenue_num"] = sales.loc[missing_revenue, "units_sold_num"] * sales.loc[missing_revenue, "sale_price_num"]

    aggregations: Dict[str, Any] = {
        "units_sold_num": "sum",
        "revenue_num": "sum",
    }

    if "last_sale_date" in sales.columns:
        sales["last_sale_date_parsed"] = pd.to_datetime(sales["last_sale_date"], errors="coerce")
        aggregations["last_sale_date_parsed"] = "max"

    grouped = sales.groupby("_join_key", as_index=False).agg(aggregations)
    grouped = grouped.rename(columns={
        "units_sold_num": "units_sold_from_sales",
        "revenue_num": "revenue_from_sales",
        "last_sale_date_parsed": "last_sale_date_from_sales",
    })
    return grouped


def _first_non_empty(series: pd.Series) -> Any:
    for item in series:
        if pd.notna(item) and str(item).strip() != "":
            return item
    return None


def _dedupe_products(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["_join_key"] = build_join_key(df)
    df = df[df["_join_key"].astype(str).str.len() > 0]
    if df.empty:
        return df

    # Keep one row per product, summing stock if duplicate and keeping useful descriptors.
    numeric_stock = to_number(df.get("stock_units", pd.Series(dtype="object")))
    df["stock_units_num_tmp"] = numeric_stock

    agg: Dict[str, Any] = {}
    for col in df.columns:
        if col == "stock_units":
            continue
        if col == "stock_units_num_tmp":
            agg[col] = "sum"
        elif col != "_join_key":
            agg[col] = _first_non_empty

    grouped = df.groupby("_join_key", as_index=False).agg(agg)
    if "stock_units_num_tmp" in grouped.columns:
        grouped["stock_units"] = grouped["stock_units_num_tmp"]
        grouped = grouped.drop(columns=["stock_units_num_tmp"])
    return grouped


def merge_prepared_files(prepared_files: List[PreparedFile]) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """Merge combined/inventory/sales files into one canonical product dataset."""
    if not prepared_files:
        raise ValueError("No hay archivos preparados para combinar.")

    combined_files = [f for f in prepared_files if f.role == "combined"]
    inventory_files = [f for f in prepared_files if f.role == "inventory"]
    sales_files = [f for f in prepared_files if f.role == "sales"]

    base_frames: List[pd.DataFrame] = []
    if combined_files:
        base_frames.extend([f.normalized_df.copy() for f in combined_files])
    if inventory_files:
        base_frames.extend([f.normalized_df.copy() for f in inventory_files])

    if base_frames:
        base = pd.concat(base_frames, ignore_index=True)
        base = _dedupe_products(base)
    else:
        # Sales-only analysis is allowed, but it will be limited because there is no stock/cost base.
        base = pd.concat([f.normalized_df.copy() for f in sales_files], ignore_index=True)
        base = _dedupe_products(base)

    merge_notes: List[str] = []
    matched_sales_products = 0
    unmatched_sales_products = 0

    if sales_files:
        sales_all = pd.concat([f.normalized_df.copy() for f in sales_files], ignore_index=True)
        sales_agg = _aggregate_sales(sales_all)
        if not base.empty and not sales_agg.empty:
            before = len(base)
            base = base.merge(sales_agg, on="_join_key", how="left")
            matched_sales_products = int(base["units_sold_from_sales"].notna().sum())
            unmatched_sales_products = int(max(0, len(sales_agg) - matched_sales_products))

            # Override/complete units sold and revenue from dedicated sales file.
            if "units_sold_from_sales" in base.columns:
                current_units = to_number(base.get("units_sold", pd.Series(dtype="object")))
                from_sales = base["units_sold_from_sales"].fillna(0)
                base["units_sold"] = from_sales.where(from_sales > 0, current_units)
            if "revenue_from_sales" in base.columns:
                current_revenue = to_number(base.get("revenue", pd.Series(dtype="object")))
                from_sales_rev = base["revenue_from_sales"].fillna(0)
                base["revenue"] = from_sales_rev.where(from_sales_rev > 0, current_revenue)
            if "last_sale_date_from_sales" in base.columns:
                base["last_sale_date"] = base["last_sale_date_from_sales"]

            merge_notes.append(f"Se han cruzado ventas con {matched_sales_products} de {before} productos del inventario/base.")
            if unmatched_sales_products > 0:
                merge_notes.append(f"Hay {unmatched_sales_products} productos de ventas que no se han podido emparejar con inventario.")

    # Clean helper columns used for merge.
    helper_columns = [col for col in base.columns if col.endswith("_from_sales") or col == "_join_key"]
    base = base.drop(columns=helper_columns, errors="ignore")

    # Ensure all canonical columns exist.
    for field in CANONICAL_FIELDS.keys():
        if field not in base.columns:
            base[field] = None

    files_summary = [
        {
            "role": f.role,
            "file_name": f.file_name,
            "rows": f.rows,
            "columns": f.columns,
            "quality_score": f.validation.get("quality_score"),
            "quality_label": f.validation.get("quality_label"),
            "can_analyze": f.validation.get("can_analyze"),
            "mapping": f.mapping,
            "validation": f.validation,
        }
        for f in prepared_files
    ]

    merge_quality = 100
    if sales_files and matched_sales_products == 0 and not base.empty:
        merge_quality -= 35
    if any(not f.validation.get("can_analyze") for f in prepared_files):
        merge_quality -= 20
    if unmatched_sales_products > 0:
        merge_quality -= min(20, unmatched_sales_products * 3)

    merge_summary = {
        "files_count": len(prepared_files),
        "combined_files": len(combined_files),
        "inventory_files": len(inventory_files),
        "sales_files": len(sales_files),
        "matched_sales_products": matched_sales_products,
        "unmatched_sales_products": unmatched_sales_products,
        "merge_quality_score": max(0, min(100, int(merge_quality))),
        "merge_notes": merge_notes,
        "files": files_summary,
        "join_strategy": "SKU / referencia; si no existe, nombre de producto normalizado",
    }

    return base, merge_summary
