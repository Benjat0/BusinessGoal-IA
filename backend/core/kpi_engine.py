from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd

from .utils import safe_divide, to_nullable_number


METRIC_COVERAGE_COLUMNS: Dict[str, str] = {
    "stock_units": "stock_units_available",
    "units_sold": "units_sold_available",
    "revenue": "estimated_revenue_available",
    "gross_margin_pct": "gross_margin_pct_available",
    "gross_profit_estimated": "gross_profit_estimated_available",
    "stock_coverage_days": "stock_coverage_days_available",
    "stock_turnover_90d": "stock_turnover_90d_available",
    "inventory_value": "inventory_value_available",
}


def _source_series(df: pd.DataFrame, column: str) -> pd.Series:
    if column in df.columns:
        return df[column]
    return pd.Series([None for _ in range(len(df))], index=df.index, dtype="object")


def _add_base_numeric(enriched: pd.DataFrame, column: str) -> None:
    observed = to_nullable_number(_source_series(enriched, column)).reindex(enriched.index)
    enriched[f"{column}_observed"] = observed
    enriched[f"{column}_available"] = observed.notna()
    # Legacy compatibility: existing consumers can still read *_num, but all
    # business rules below use the availability columns before interpreting 0.
    enriched[f"{column}_num"] = observed.fillna(0.0).astype(float)


def _set_derived_metric(
    enriched: pd.DataFrame,
    metric: str,
    values: pd.Series,
    available: pd.Series,
) -> None:
    available = available.reindex(enriched.index).fillna(False).astype(bool)
    observed = pd.Series([pd.NA for _ in range(len(enriched))], index=enriched.index, dtype="Float64")
    observed.loc[available] = pd.to_numeric(values.reindex(enriched.index).loc[available], errors="coerce")
    observed = pd.to_numeric(observed, errors="coerce")
    enriched[f"{metric}_observed"] = observed
    enriched[f"{metric}_available"] = available & observed.notna()
    enriched[metric] = observed.fillna(0.0).astype(float)


def _available_mask(enriched: pd.DataFrame, column: str) -> pd.Series:
    if column not in enriched.columns:
        return pd.Series([False for _ in range(len(enriched))], index=enriched.index)
    return enriched[column].fillna(False).astype(bool)


def enrich_product_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """Add product-level metrics used by the recommendation engine."""
    enriched = df.copy()

    for column in ["stock_units", "unit_cost", "sale_price", "units_sold", "revenue"]:
        _add_base_numeric(enriched, column)

    estimated_revenue_values = enriched["revenue_observed"].copy()
    revenue_from_units = enriched["units_sold_observed"] * enriched["sale_price_observed"]
    revenue_from_units_available = enriched["units_sold_available"] & enriched["sale_price_available"]
    estimated_revenue_values = estimated_revenue_values.where(
        enriched["revenue_available"],
        revenue_from_units,
    )
    _set_derived_metric(
        enriched,
        "estimated_revenue",
        estimated_revenue_values,
        enriched["revenue_available"] | revenue_from_units_available,
    )

    _set_derived_metric(
        enriched,
        "inventory_value",
        enriched["stock_units_observed"] * enriched["unit_cost_observed"],
        enriched["stock_units_available"] & enriched["unit_cost_available"],
    )
    _set_derived_metric(
        enriched,
        "unit_margin",
        enriched["sale_price_observed"] - enriched["unit_cost_observed"],
        enriched["sale_price_available"] & enriched["unit_cost_available"],
    )
    _set_derived_metric(
        enriched,
        "gross_margin_pct",
        (enriched["unit_margin_observed"] / enriched["sale_price_observed"]) * 100,
        enriched["unit_margin_available"] & (enriched["sale_price_observed"] > 0),
    )
    _set_derived_metric(
        enriched,
        "gross_profit_estimated",
        enriched["units_sold_observed"] * enriched["unit_margin_observed"],
        enriched["units_sold_available"] & enriched["unit_margin_available"],
    )

    # MVP assumption: units_sold represents the last 90 days when no period is provided.
    _set_derived_metric(
        enriched,
        "daily_sales_velocity",
        enriched["units_sold_observed"] / 90,
        enriched["units_sold_available"],
    )
    _set_derived_metric(
        enriched,
        "stock_coverage_days",
        enriched["stock_units_observed"] / enriched["daily_sales_velocity_observed"],
        enriched["stock_units_available"] & enriched["units_sold_available"] & (enriched["units_sold_observed"] > 0),
    )
    _set_derived_metric(
        enriched,
        "stock_turnover_90d",
        enriched["units_sold_observed"] / enriched["stock_units_observed"],
        enriched["stock_units_available"] & enriched["units_sold_available"] & (enriched["stock_units_observed"] > 0),
    )

    return enriched


def calculate_metric_coverage(enriched: pd.DataFrame) -> Dict[str, float]:
    """Return full-dataset metric availability coverage."""
    total_rows = int(len(enriched))
    if total_rows <= 0:
        return {key: 0.0 for key in METRIC_COVERAGE_COLUMNS}

    coverage: Dict[str, float] = {}
    for key, availability_column in METRIC_COVERAGE_COLUMNS.items():
        if availability_column not in enriched.columns:
            coverage[key] = 0.0
            continue
        available = _available_mask(enriched, availability_column)
        coverage[key] = round(float(available.sum()) / total_rows, 4)
    return coverage


def calculate_summary_kpis(enriched: pd.DataFrame) -> Dict[str, Any]:
    """Calculate executive-level KPIs."""
    inventory_mask = _available_mask(enriched, "inventory_value_available")
    revenue_mask = _available_mask(enriched, "estimated_revenue_available")
    gross_profit_mask = _available_mask(enriched, "gross_profit_estimated_available")

    total_inventory_value = float(enriched.loc[inventory_mask, "inventory_value"].sum())
    total_revenue = float(enriched.loc[revenue_mask, "estimated_revenue"].sum())
    total_gross_profit = float(enriched.loc[gross_profit_mask, "gross_profit_estimated"].sum())

    paired_margin_mask = (
        gross_profit_mask
        & revenue_mask
        & (enriched["estimated_revenue"] > 0)
    )
    paired_revenue = float(enriched.loc[paired_margin_mask, "estimated_revenue"].sum())
    paired_gross_profit = float(enriched.loc[paired_margin_mask, "gross_profit_estimated"].sum())
    avg_margin_pct = safe_divide(paired_gross_profit, paired_revenue) * 100

    products_count = int(len(enriched))
    units_sold_mask = _available_mask(enriched, "units_sold_available")
    stock_units_mask = _available_mask(enriched, "stock_units_available")
    # Negative units can represent returns; only an observed zero is "without sales".
    products_without_sales = int((units_sold_mask & (enriched["units_sold_num"] == 0)).sum())
    high_stock_low_sales = int(
        (
            stock_units_mask
            & units_sold_mask
            & (enriched["stock_units_num"] > 0)
            & (enriched["units_sold_num"] <= 3)
        ).sum()
    )

    return {
        "products_count": products_count,
        "total_inventory_value": round(total_inventory_value, 2),
        "total_revenue_estimated": round(total_revenue, 2),
        "total_gross_profit_estimated": round(total_gross_profit, 2),
        "average_margin_pct": round(avg_margin_pct, 2),
        "products_without_sales": products_without_sales,
        "high_stock_low_sales_products": high_stock_low_sales,
    }


def product_records(enriched: pd.DataFrame, limit: int = 100) -> List[Dict[str, Any]]:
    visible_columns = [
        "sku",
        "product_name",
        "category",
        "supplier",
        "stock_units_num",
        "unit_cost_num",
        "sale_price_num",
        "units_sold_num",
        "inventory_value",
        "gross_margin_pct",
        "gross_profit_estimated",
        "stock_coverage_days",
        "stock_turnover_90d",
    ]
    available_columns = [col for col in visible_columns if col in enriched.columns]
    records = enriched[available_columns].head(limit).copy()
    availability_columns = {
        "stock_units_num": "stock_units_available",
        "unit_cost_num": "unit_cost_available",
        "sale_price_num": "sale_price_available",
        "units_sold_num": "units_sold_available",
        "inventory_value": "inventory_value_available",
        "gross_margin_pct": "gross_margin_pct_available",
        "gross_profit_estimated": "gross_profit_estimated_available",
        "stock_coverage_days": "stock_coverage_days_available",
        "stock_turnover_90d": "stock_turnover_90d_available",
    }
    for value_column, availability_column in availability_columns.items():
        if value_column not in records.columns or availability_column not in enriched.columns:
            continue
        available = enriched[availability_column].head(limit).fillna(False).astype(bool)
        records.loc[~available, value_column] = None
    output = records.where(pd.notna(records), None).to_dict(orient="records")
    return output
