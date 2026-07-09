from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import _build_business_status, _calculate_business_score
from core.analysis_comparison import build_analysis_comparison
from core.analysis_snapshot import build_analysis_snapshot
from core.economic_value import build_economic_value_summary
from core.kpi_engine import calculate_metric_coverage, calculate_summary_kpis, enrich_product_metrics
from core.recommendation_engine import build_recommendations
from core.utils import parse_business_number, parse_business_number_nullable


def _period() -> dict:
    return {
        "kind": "ASSUMED_WINDOW",
        "start_date": None,
        "end_date": None,
        "days": 90,
        "label": "Ventana asumida",
        "confidence": 0.35,
        "source": "TEST",
    }


def _snapshot(analysis_id: str, enriched: pd.DataFrame, summary: dict | None = None) -> dict:
    period = _period()
    metric_coverage = calculate_metric_coverage(enriched)
    return build_analysis_snapshot(
        analysis_id=analysis_id,
        analysis_created_at="2026-07-09T10:00:00Z",
        analysis_period=period,
        business_profile={"sector": "retail", "analysis_goal": "balanced"},
        summary=summary or calculate_summary_kpis(enriched),
        economic_value_summary=build_economic_value_summary(recommendations=[], analysis_period=period),
        enriched=enriched,
        recommendations=[],
        column_mapping={
            "sku": "sku",
            "product_name": "product_name",
            "stock_units": "stock_units",
            "unit_cost": "unit_cost",
            "sale_price": "sale_price",
            "units_sold": "units_sold",
            "revenue": "revenue",
        },
        mapping_confidence={},
        validation={"quality_score": 90, "quality_label": "Alta", "missing_required_fields": []},
        merge_summary=None,
        metric_coverage=metric_coverage,
    )


def _profile(**overrides: float) -> dict:
    profile = {
        "target_margin_pct": 35,
        "low_margin_pct": 20,
        "max_coverage_days": 180,
        "stockout_sensitivity": 0.15,
        "min_sales_for_restock": 20,
        "min_sales_for_margin_alert": 10,
    }
    profile.update(overrides)
    return profile


class DataAvailabilityTests(unittest.TestCase):
    def test_nullable_parser_preserves_missing_and_observed_zero(self):
        for value in [None, "", "   ", float("nan"), "nan", "none", "null", "abc"]:
            self.assertIsNone(parse_business_number_nullable(value))
            self.assertEqual(parse_business_number(value), 0.0)

        for value in [0, "0", "0,00"]:
            self.assertEqual(parse_business_number_nullable(value), 0.0)

        cases = {
            119.75: 119.75,
            "119,75": 119.75,
            "1.199,75": 1199.75,
            "1,199.75": 1199.75,
            "€ 1.199,75": 1199.75,
        }
        for raw, expected in cases.items():
            self.assertEqual(parse_business_number_nullable(raw), expected)

    def test_units_sold_availability_counts_zero_as_observed(self):
        sparse = enrich_product_metrics(pd.DataFrame({"units_sold": [20, 10, None, ""]}))

        self.assertEqual(sparse["units_sold_available"].tolist(), [True, True, False, False])
        self.assertEqual(calculate_metric_coverage(sparse)["units_sold"], 0.5)

        with_zero = enrich_product_metrics(pd.DataFrame({"units_sold": [20, 10, None, 0]}))

        self.assertEqual(with_zero["units_sold_available"].tolist(), [True, True, False, True])
        self.assertEqual(calculate_metric_coverage(with_zero)["units_sold"], 0.75)

    def test_snapshot_serializes_missing_as_null_and_zero_as_zero(self):
        enriched = enrich_product_metrics(pd.DataFrame([
            {"sku": "SKU-1", "product_name": "A", "units_sold": 20},
            {"sku": "SKU-2", "product_name": "B", "units_sold": 10},
            {"sku": "SKU-3", "product_name": "C", "units_sold": None},
            {"sku": "SKU-4", "product_name": "D", "units_sold": ""},
        ]))

        snapshot = _snapshot("sparse", enriched)
        metrics = [item["metrics"]["units_sold"] for item in snapshot["product_metrics"]]

        self.assertEqual(snapshot["comparability_metadata"]["metric_coverage"]["units_sold"], 0.5)
        self.assertEqual(metrics, [20.0, 10.0, None, None])

        explicit_zero = enrich_product_metrics(pd.DataFrame([
            {"sku": "SKU-1", "product_name": "A", "units_sold": 20},
            {"sku": "SKU-2", "product_name": "B", "units_sold": 10},
            {"sku": "SKU-3", "product_name": "C", "units_sold": None},
            {"sku": "SKU-4", "product_name": "D", "units_sold": 0},
        ]))
        zero_snapshot = _snapshot("zero", explicit_zero)

        self.assertEqual(zero_snapshot["comparability_metadata"]["metric_coverage"]["units_sold"], 0.75)
        self.assertEqual(zero_snapshot["product_metrics"][3]["metrics"]["units_sold"], 0.0)

    def test_snapshot_metric_coverage_uses_full_dataset_not_product_sample(self):
        rows = [
            {"sku": f"SKU-{index}", "product_name": f"P{index}", "units_sold": 1 if index < 250 else None}
            for index in range(1000)
        ]
        enriched = enrich_product_metrics(pd.DataFrame(rows))

        snapshot = _snapshot("large", enriched)

        self.assertEqual(snapshot["product_metrics_count"], 250)
        self.assertTrue(snapshot["product_metrics_truncated"])
        self.assertEqual(snapshot["comparability_metadata"]["metric_coverage"]["units_sold"], 0.25)

    def test_summary_kpis_ignore_missing_sales_and_require_metric_basis(self):
        sales_summary = calculate_summary_kpis(enrich_product_metrics(pd.DataFrame({
            "units_sold": [10, 0, None, "", "abc"],
        })))
        self.assertEqual(sales_summary["products_without_sales"], 1)

        high_stock = calculate_summary_kpis(enrich_product_metrics(pd.DataFrame({
            "stock_units": [100, 100, None],
            "units_sold": [2, None, 2],
        })))
        self.assertEqual(high_stock["high_stock_low_sales_products"], 1)

        inventory = enrich_product_metrics(pd.DataFrame({
            "stock_units": [10, 10, 0],
            "unit_cost": [5, None, 5],
        }))
        inventory_summary = calculate_summary_kpis(inventory)

        self.assertEqual(inventory_summary["total_inventory_value"], 50.0)
        self.assertEqual(calculate_metric_coverage(inventory)["inventory_value"], 0.6667)
        self.assertEqual(inventory["inventory_value_available"].tolist(), [True, False, True])

        margin = calculate_summary_kpis(enrich_product_metrics(pd.DataFrame([
            {"units_sold": 10, "sale_price": 20, "unit_cost": 10, "revenue": 200},
            {"units_sold": 10, "sale_price": 10, "unit_cost": 5, "revenue": None},
            {"units_sold": None, "sale_price": 10, "unit_cost": 5, "revenue": 100},
        ])))

        self.assertEqual(margin["total_revenue_estimated"], 400.0)
        self.assertEqual(margin["total_gross_profit_estimated"], 150.0)
        self.assertEqual(margin["average_margin_pct"], 50.0)

    def test_recommendations_do_not_treat_missing_sales_as_dead_stock(self):
        enriched = enrich_product_metrics(pd.DataFrame([
            {"product_name": "Sparse", "stock_units": 100, "unit_cost": 10, "sale_price": 20, "units_sold": None},
        ]))

        recommendations = build_recommendations(enriched, business_profile=_profile())

        self.assertNotIn("dead_stock", {item["type"] for item in recommendations})

    def test_recommendations_detect_dead_stock_only_for_observed_zero_sales(self):
        enriched = enrich_product_metrics(pd.DataFrame([
            {"product_name": "Zero", "stock_units": 100, "unit_cost": 10, "sale_price": 20, "units_sold": 0},
        ]))

        recommendations = build_recommendations(enriched, business_profile=_profile())
        dead_stock = [item for item in recommendations if item["type"] == "dead_stock"]

        self.assertEqual(len(dead_stock), 1)
        self.assertEqual(dead_stock[0]["economic_impact"], 1000.0)

    def test_recommendations_do_not_quantify_cash_release_without_cost(self):
        enriched = enrich_product_metrics(pd.DataFrame([
            {"product_name": "No Cost", "stock_units": 100, "unit_cost": None, "sale_price": 20, "units_sold": 0},
        ]))

        recommendations = build_recommendations(enriched, business_profile=_profile())

        self.assertNotIn("dead_stock", {item["type"] for item in recommendations})

    def test_recommendation_guards_for_excess_margin_and_stockout(self):
        rows = [
            {"product_name": "No Sales", "stock_units": 100, "unit_cost": 10, "sale_price": 20, "units_sold": None},
            {"product_name": "No Cost Margin", "stock_units": 20, "unit_cost": None, "sale_price": 100, "units_sold": 30},
            {"product_name": "No Cost Stockout", "stock_units": 1, "unit_cost": None, "sale_price": 100, "units_sold": 30},
        ]
        enriched = enrich_product_metrics(pd.DataFrame(rows))

        recommendations = build_recommendations(enriched, business_profile=_profile())
        types = {item["type"] for item in recommendations}

        self.assertNotIn("excess_stock", types)
        self.assertNotIn("low_margin_high_sales", types)
        self.assertNotIn("stockout_risk", types)
        self.assertFalse(any(item["category"] == "sales_protection" for item in recommendations))

    def test_business_score_uses_margin_and_inventory_coverage(self):
        sparse_margin = _calculate_business_score(
            {"average_margin_pct": 0, "cash_release_potential": 0, "total_inventory_value": 1000},
            [],
            metric_coverage={"gross_profit_estimated": 0.1, "revenue": 1.0, "inventory_value": 1.0},
        )
        sufficient_margin = _calculate_business_score(
            {"average_margin_pct": 0, "cash_release_potential": 0, "total_inventory_value": 1000},
            [],
            metric_coverage={"gross_profit_estimated": 1.0, "revenue": 1.0, "inventory_value": 1.0},
        )

        self.assertGreater(sparse_margin["business_score_current"], sufficient_margin["business_score_current"])

        sparse_inventory = _calculate_business_score(
            {"average_margin_pct": 30, "cash_release_potential": 700, "total_inventory_value": 1000},
            [],
            metric_coverage={"gross_profit_estimated": 1.0, "revenue": 1.0, "inventory_value": 0.1},
        )
        sufficient_inventory = _calculate_business_score(
            {"average_margin_pct": 30, "cash_release_potential": 700, "total_inventory_value": 1000},
            [],
            metric_coverage={"gross_profit_estimated": 1.0, "revenue": 1.0, "inventory_value": 1.0},
        )

        self.assertGreater(sparse_inventory["business_score_current"], sufficient_inventory["business_score_current"])

    def test_business_status_uses_inventory_coverage_for_capital_pressure(self):
        summary = {"cash_release_potential": 700, "total_inventory_value": 1000}
        recommendations = [
            {"priority": "medium", "type": "excess_stock", "category": "cash_release", "economic_impact": 700},
        ]

        sparse = _build_business_status(summary, recommendations, metric_coverage={"inventory_value": 0.1})
        sufficient = _build_business_status(summary, recommendations, metric_coverage={"inventory_value": 1.0})

        self.assertNotEqual(sparse["status"], "Atención prioritaria")
        self.assertIsNone(sparse["signals"]["capital_pressure_pct"])
        self.assertEqual(sufficient["status"], "Atención prioritaria")
        self.assertEqual(sufficient["signals"]["capital_pressure_pct"], 70.0)

    def test_analysis_comparison_blocks_artificial_margin_zero_with_low_coverage(self):
        baseline_enriched = enrich_product_metrics(pd.DataFrame([
            {"sku": "SKU-1", "product_name": "A", "units_sold": 10, "sale_price": 20, "unit_cost": None},
        ]))
        candidate_enriched = enrich_product_metrics(pd.DataFrame([
            {"sku": "SKU-1", "product_name": "A", "units_sold": 10, "sale_price": 20, "unit_cost": 10},
        ]))
        baseline = _snapshot("baseline", baseline_enriched)
        candidate = _snapshot("candidate", candidate_enriched)

        result = build_analysis_comparison(baseline, candidate)

        self.assertNotIn("average_margin_pct", [change["key"] for change in result["changes"]])


if __name__ == "__main__":
    unittest.main()
