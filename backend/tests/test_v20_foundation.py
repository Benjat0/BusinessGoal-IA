from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import _build_analysis_response
from core.analysis_period import build_analysis_period
from core.analysis_snapshot import build_analysis_snapshot
from core.comparability import compare_analysis_snapshots
from core.economic_value import build_economic_value_summary
from core.kpi_engine import enrich_product_metrics


class V20FoundationTests(unittest.TestCase):
    def _enriched(self) -> pd.DataFrame:
        return enrich_product_metrics(pd.DataFrame([
            {
                "sku": "SKU-1",
                "product_name": "Urban Chair",
                "category": "Home",
                "stock_units": 20,
                "unit_cost": 10,
                "sale_price": 20,
                "units_sold": 0,
                "revenue": 0,
            },
            {
                "sku": "SKU-2",
                "product_name": "Desk Lamp",
                "category": "Home",
                "stock_units": 2,
                "unit_cost": 5,
                "sale_price": 15,
                "units_sold": 30,
                "revenue": 450,
            },
        ]))

    def _snapshot(self, *, analysis_id: str = "a1", period_days: int = 90, profile_goal: str = "balanced"):
        enriched = self._enriched()
        period = {
            "kind": "ASSUMED_WINDOW",
            "start_date": None,
            "end_date": None,
            "days": period_days,
            "label": f"Ventana asumida: {period_days} dias",
            "confidence": 0.35,
            "source": "TEST",
        }
        economic_value = build_economic_value_summary(
            recommendations=[
                {"category": "cash_release", "economic_impact": 200},
                {"category": "sales_protection", "economic_impact": 300},
            ],
            analysis_period=period,
        )
        return build_analysis_snapshot(
            analysis_id=analysis_id,
            analysis_created_at="2026-07-05T12:00:00Z",
            analysis_period=period,
            business_profile={
                "sector": "retail",
                "analysis_goal": profile_goal,
                "target_margin_pct": 35,
                "low_margin_pct": 20,
                "max_coverage_days": 180,
            },
            summary={"products_count": 2, "total_inventory_value": 210},
            economic_value_summary=economic_value,
            enriched=enriched,
            recommendations=[{"category": "cash_release", "type": "dead_stock", "economic_impact": 200}],
            column_mapping={"sku": "sku", "product_name": "producto", "stock_units": "stock", "units_sold": "ventas_90d"},
            mapping_confidence={"sku": 1, "product_name": 1, "stock_units": 1, "units_sold": 1},
            validation={"quality_score": 90, "quality_label": "Alta", "missing_required_fields": []},
            merge_summary={"combined_files": 1, "inventory_files": 0, "sales_files": 0, "merge_quality_score": 90, "join_strategy": "SKU"},
        )

    def test_economic_value_semantics_are_non_additive(self):
        summary = build_economic_value_summary(
            recommendations=[
                {"category": "cash_release", "economic_impact": 1000},
                {"category": "margin_improvement", "economic_impact": 250},
                {"category": "sales_protection", "economic_impact": 500},
            ],
            analysis_period={"days": 90},
        )

        self.assertFalse(summary["is_additive"])
        self.assertEqual(summary["display_total"], 1750)
        classes = {category["economic_class"] for category in summary["categories"]}
        self.assertEqual(classes, {"CASH_RELEASE", "MARGIN_OPPORTUNITY", "REVENUE_AT_RISK"})
        self.assertIn("no deben interpretarse como beneficio", summary["disclaimer"].lower())

    def test_analysis_period_does_not_invent_dates(self):
        period = build_analysis_period(
            detected_columns=["Producto", "Unidades vendidas 90d"],
            column_mapping={"units_sold": "Unidades vendidas 90d", "revenue": None},
            normalized_df=pd.DataFrame({"last_sale_date": ["2026-01-01", "2026-02-01"]}),
        )

        self.assertEqual(period["kind"], "ASSUMED_WINDOW")
        self.assertEqual(period["days"], 90)
        self.assertIsNone(period["start_date"])
        self.assertIsNone(period["end_date"])
        self.assertIn("COLUMN_SEMANTIC", period["source"])

    def test_analysis_period_detects_transaction_date_range(self):
        period = build_analysis_period(
            detected_columns=["Producto", "Fecha venta", "Importe"],
            column_mapping={"units_sold": None, "revenue": "Importe", "last_sale_date": "Fecha venta"},
            normalized_df=pd.DataFrame({"last_sale_date": ["2026-01-01", "2026-01-10", None]}),
        )

        self.assertEqual(period["kind"], "DETECTED_DATE_RANGE")
        self.assertEqual(period["start_date"], "2026-01-01")
        self.assertEqual(period["end_date"], "2026-01-10")
        self.assertEqual(period["days"], 10)

    def test_analysis_snapshot_is_compact_and_uses_product_identity(self):
        snapshot = self._snapshot()

        self.assertEqual(snapshot["analysis_id"], "a1")
        self.assertEqual(snapshot["product_count"], 2)
        self.assertLessEqual(snapshot["product_metrics_count"], 250)
        self.assertIn("economic_value_summary", snapshot)
        first_ref = snapshot["product_metrics"][0]["product_ref"]
        self.assertEqual(first_ref["identity_type"], "SKU")
        self.assertNotIn("recommendations", snapshot)

    def test_comparability_comparable(self):
        result = compare_analysis_snapshots(self._snapshot(analysis_id="a1"), self._snapshot(analysis_id="a2"))

        self.assertEqual(result["status"], "COMPARABLE")
        self.assertGreaterEqual(result["score"], 75)
        self.assertEqual(result["shared_products"], 2)

    def test_comparability_partially_comparable(self):
        baseline = self._snapshot(analysis_id="a1")
        candidate = self._snapshot(analysis_id="a2", period_days=30, profile_goal="cash")

        result = compare_analysis_snapshots(baseline, candidate)

        self.assertEqual(result["status"], "PARTIALLY_COMPARABLE")
        self.assertIn("analysis_period_days_changed", result["warnings"])

    def test_comparability_not_comparable(self):
        baseline = self._snapshot(analysis_id="a1")
        candidate = self._snapshot(analysis_id="a2")
        candidate["product_metrics"] = []
        candidate["comparability_metadata"]["metric_coverage"] = {}

        result = compare_analysis_snapshots(baseline, candidate)

        self.assertEqual(result["status"], "NOT_COMPARABLE")
        self.assertIn("product_identity_missing", result["warnings"])

    def test_analysis_response_includes_identity_period_and_snapshot(self):
        normalized = pd.DataFrame(
            [
                {"sku": "SKU-1", "product_name": "Urban Chair", "stock_units": 20, "unit_cost": 10, "sale_price": 20, "units_sold": 0},
                {"sku": "SKU-2", "product_name": "Desk Lamp", "stock_units": 2, "unit_cost": 5, "sale_price": 15, "units_sold": 30},
            ]
        )

        payload = _build_analysis_response(
            file_name="sample.csv",
            rows=2,
            columns=6,
            detected_columns=["sku", "producto", "stock", "coste", "precio", "ventas_90d"],
            column_mapping={
                "sku": "sku",
                "product_name": "producto",
                "stock_units": "stock",
                "unit_cost": "coste",
                "sale_price": "precio",
                "units_sold": "ventas_90d",
            },
            mapping_confidence={"sku": 1, "product_name": 1, "stock_units": 1, "unit_cost": 1, "sale_price": 1, "units_sold": 1},
            validation={"quality_score": 90, "quality_label": "Alta", "missing_required_fields": []},
            normalized_df=normalized,
        )

        self.assertRegex(payload["analysis_id"], r"^[0-9a-f-]{36}$")
        self.assertRegex(payload["analysis_created_at"], r"^\d{4}-\d{2}-\d{2}T.*Z$")
        self.assertEqual(payload["analysis_period"]["kind"], "ASSUMED_WINDOW")
        self.assertIsNone(payload["analysis_period"]["start_date"])
        self.assertFalse(payload["economic_value_summary"]["is_additive"])
        self.assertEqual(payload["analysis_snapshot"]["analysis_id"], payload["analysis_id"])


if __name__ == "__main__":
    unittest.main()
