from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd

from .utils import safe_divide, to_number


def enrich_product_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """Add product-level metrics used by the recommendation engine."""
    enriched = df.copy()

    enriched["stock_units_num"] = to_number(enriched.get("stock_units", pd.Series(dtype="object")))
    enriched["unit_cost_num"] = to_number(enriched.get("unit_cost", pd.Series(dtype="object")))
    enriched["sale_price_num"] = to_number(enriched.get("sale_price", pd.Series(dtype="object")))
    enriched["units_sold_num"] = to_number(enriched.get("units_sold", pd.Series(dtype="object")))
    enriched["revenue_num"] = to_number(enriched.get("revenue", pd.Series(dtype="object")))

    # If revenue is missing but units sold and sale price exist, estimate it.
    enriched["estimated_revenue"] = enriched["revenue_num"]
    missing_revenue = enriched["estimated_revenue"] <= 0
    enriched.loc[missing_revenue, "estimated_revenue"] = (
        enriched.loc[missing_revenue, "units_sold_num"] * enriched.loc[missing_revenue, "sale_price_num"]
    )

    enriched["inventory_value"] = enriched["stock_units_num"] * enriched["unit_cost_num"]
    enriched["unit_margin"] = enriched["sale_price_num"] - enriched["unit_cost_num"]
    enriched["gross_margin_pct"] = enriched.apply(
        lambda row: safe_divide(row["unit_margin"], row["sale_price_num"]) * 100,
        axis=1,
    )
    enriched["gross_profit_estimated"] = enriched["units_sold_num"] * enriched["unit_margin"]

    # MVP assumption: units_sold represents the last 90 days when no period is provided.
    enriched["daily_sales_velocity"] = enriched["units_sold_num"] / 90
    enriched["stock_coverage_days"] = enriched.apply(
        lambda row: safe_divide(row["stock_units_num"], row["daily_sales_velocity"]),
        axis=1,
    )

    enriched["stock_turnover_90d"] = enriched.apply(
        lambda row: safe_divide(row["units_sold_num"], row["stock_units_num"]),
        axis=1,
    )

    return enriched


def calculate_summary_kpis(enriched: pd.DataFrame) -> Dict[str, Any]:
    """Calculate executive-level KPIs."""
    total_inventory_value = float(enriched["inventory_value"].sum())
    total_revenue = float(enriched["estimated_revenue"].sum())
    total_gross_profit = float(enriched["gross_profit_estimated"].sum())
    avg_margin_pct = safe_divide(total_gross_profit, total_revenue) * 100

    products_count = int(len(enriched))
    products_without_sales = int((enriched["units_sold_num"] <= 0).sum())
    high_stock_low_sales = int(
        ((enriched["stock_units_num"] > 0) & (enriched["units_sold_num"] <= 3)).sum()
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
    output = enriched[available_columns].head(limit).fillna("").to_dict(orient="records")
    return output
