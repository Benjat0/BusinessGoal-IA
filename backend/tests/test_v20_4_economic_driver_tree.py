from __future__ import annotations

import json
import math
import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.decision_engine import build_decisions
from core.kpi_engine import enrich_product_metrics
from main import (
    _build_analysis_response,
    detect_columns,
    infer_file_type,
    normalize_dataframe,
    read_uploaded_file,
    validate_file,
)


class V204EconomicDriverTreeTests(unittest.TestCase):
    def _enriched(self, *, include_sku: bool = True) -> pd.DataFrame:
        row = {
            "sku": "SKU-1" if include_sku else None,
            "product_name": "Urban Chair",
            "category": "Home",
            "stock_units": 12,
            "unit_cost": 10,
            "sale_price": 20,
            "units_sold": 0,
            "revenue": 0,
        }
        return enrich_product_metrics(pd.DataFrame([row]))

    def _profile(self):
        return {
            "sector": "retail",
            "target_margin_pct": 35.0,
            "low_margin_pct": 20.0,
            "max_coverage_days": 180.0,
            "stockout_sensitivity": 0.15,
            "min_sales_for_restock": 20.0,
            "min_sales_for_margin_alert": 10.0,
        }

    def _snapshot(self, **overrides):
        base = {
            "stock_units": 12,
            "units_sold": 0,
            "inventory_value": 120,
            "gross_margin_pct": None,
            "gross_profit_estimated": None,
            "stock_coverage_days": None,
            "stock_turnover_90d": None,
        }
        base.update(overrides)
        return base

    def _recommendation(self, **overrides):
        base = {
            "type": "dead_stock",
            "category": "cash_release",
            "priority": "high",
            "economic_impact": 120.0,
            "confidence_level": 91,
            "title": "Liquidar productos sin ventas recientes",
            "what_happens": "Urban Chair mantiene stock y no registra ventas.",
            "why_it_matters": "Hay caja inmovilizada.",
            "recommended_action": "Crear una campaña de liquidación.",
            "first_step": "Crear una lista de liquidación.",
            "expected_business_effect": "Reducir inventario improductivo.",
            "probable_cause": "Demanda insuficiente.",
            "timeframe": "7-14 días",
            "affected_products_count": 1,
            "detail_items": [
                {
                    "product": "Urban Chair",
                    "impact": 120.0,
                    "priority": "high",
                    "confidence_level": 91,
                    "what_happens": "Urban Chair mantiene 12 unidades sin ventas.",
                    "kpi_snapshot": self._snapshot(),
                }
            ],
        }
        base.update(overrides)
        return base

    def _decisions(self, recommendations=None, *, enriched=None):
        return build_decisions(
            analysis_id="analysis-v20-4",
            analysis_created_at="2026-07-12T12:00:00Z",
            consolidated_recommendations=recommendations if recommendations is not None else [self._recommendation()],
            enriched=enriched if enriched is not None else self._enriched(),
            business_profile=self._profile(),
        )

    def _signal(self, decision, key: str):
        signals = decision["economic_driver_tree"]["branches"][0]["signals"]
        return next(item for item in signals if item["key"] == key)

    def test_each_decision_has_economic_driver_tree(self):
        decisions = self._decisions([
            self._recommendation(),
            self._recommendation(
                type="low_margin_high_sales",
                category="margin_improvement",
                detail_items=[{**self._recommendation()["detail_items"][0], "kpi_snapshot": self._snapshot(units_sold=30, gross_margin_pct=12, gross_profit_estimated=80)}],
            ),
            self._recommendation(
                type="stockout_risk",
                category="sales_protection",
                detail_items=[{**self._recommendation()["detail_items"][0], "kpi_snapshot": self._snapshot(stock_units=2, units_sold=50, gross_profit_estimated=300)}],
            ),
        ])

        self.assertTrue(decisions)
        self.assertTrue(all("economic_driver_tree" in decision for decision in decisions))

    def test_cash_release_generates_capital_branch(self):
        decision = self._decisions()[0]

        branch = decision["economic_driver_tree"]["branches"][0]
        self.assertEqual(branch["driver_type"], "CAPITAL")
        self.assertEqual(decision["economic_driver_tree"]["primary_driver"]["label"], "Caja liberable")

    def test_margin_improvement_generates_margin_branch(self):
        rec = self._recommendation(
            type="low_margin_high_sales",
            category="margin_improvement",
            detail_items=[{**self._recommendation()["detail_items"][0], "kpi_snapshot": self._snapshot(units_sold=30, gross_margin_pct=12, gross_profit_estimated=80)}],
        )
        decision = self._decisions([rec])[0]

        self.assertEqual(decision["economic_driver_tree"]["branches"][0]["driver_type"], "MARGIN")
        self.assertEqual(decision["economic_driver_tree"]["primary_driver"]["label"], "Margen mejorable")

    def test_sales_protection_generates_sales_risk_branch(self):
        rec = self._recommendation(
            type="stockout_risk",
            category="sales_protection",
            detail_items=[{**self._recommendation()["detail_items"][0], "kpi_snapshot": self._snapshot(stock_units=2, units_sold=50, gross_profit_estimated=300)}],
        )
        decision = self._decisions([rec])[0]

        self.assertEqual(decision["economic_driver_tree"]["branches"][0]["driver_type"], "SALES_RISK")
        self.assertEqual(decision["economic_driver_tree"]["primary_driver"]["label"], "Margen expuesto")

    def test_missing_metric_is_preserved_as_null(self):
        rec = self._recommendation(detail_items=[{**self._recommendation()["detail_items"][0], "kpi_snapshot": self._snapshot(inventory_value=None)}])
        decision = self._decisions([rec])[0]

        signal = self._signal(decision, "inventory_value")
        self.assertIsNone(signal["observed_value"])
        self.assertEqual(signal["direction"], "MISSING")

    def test_zero_metric_is_preserved_as_zero(self):
        decision = self._decisions()[0]

        signal = self._signal(decision, "units_sold")
        self.assertEqual(signal["observed_value"], 0)
        self.assertEqual(signal["direction"], "PRESENT")

    def test_tree_is_strict_json_serializable_without_non_finite_numbers(self):
        rec = self._recommendation(
            economic_impact=math.nan,
            detail_items=[{**self._recommendation()["detail_items"][0], "impact": math.inf, "kpi_snapshot": self._snapshot(inventory_value=math.inf)}],
        )
        decisions = self._decisions([rec])

        json.dumps(decisions, allow_nan=False)

    def test_product_refs_are_propagated_to_signals(self):
        decision = self._decisions()[0]

        signal = self._signal(decision, "inventory_value")
        self.assertEqual(signal["product_refs"][0]["sku"], "SKU-1")

    def test_evidence_ids_are_propagated_to_branches(self):
        decision = self._decisions()[0]

        branch = decision["economic_driver_tree"]["branches"][0]
        self.assertEqual(branch["evidence_item_ids"], decision["recommendation_ids"])

    def test_data_limitations_appear_when_metrics_are_missing(self):
        rec = self._recommendation(
            type="low_margin_high_sales",
            category="margin_improvement",
            detail_items=[{**self._recommendation()["detail_items"][0], "kpi_snapshot": self._snapshot(gross_margin_pct=None, gross_profit_estimated=None)}],
        )
        decision = self._decisions([rec])[0]

        limitations = decision["economic_driver_tree"]["data_limitations"]
        self.assertTrue(any("Falta la métrica" in item for item in limitations))

    def test_tree_uses_decision_estimated_impact_only(self):
        rec = self._recommendation(
            economic_impact=321.0,
            display_total=999999,
            potential_recoverable_benefit=999999,
            total_impact=999999,
        )
        decision = self._decisions([rec])[0]

        self.assertEqual(decision["economic_driver_tree"]["primary_driver"]["value"], 321.0)

    def test_tree_is_deterministic_for_same_input(self):
        first = self._decisions()[0]["economic_driver_tree"]
        second = self._decisions()[0]["economic_driver_tree"]

        self.assertEqual(first, second)

    def test_full_response_includes_economic_driver_tree_inside_decisions(self):
        df = pd.DataFrame([
            {
                "sku": "SKU-1",
                "product_name": "Urban Chair",
                "stock_units": 12,
                "unit_cost": 10,
                "sale_price": 20,
                "units_sold": 0,
                "revenue": 0,
            }
        ])
        response = _build_analysis_response(
            file_name="test.csv",
            rows=1,
            columns=len(df.columns),
            detected_columns=list(df.columns),
            column_mapping={
                "sku": "sku",
                "product_name": "product_name",
                "stock_units": "stock_units",
                "unit_cost": "unit_cost",
                "sale_price": "sale_price",
                "units_sold": "units_sold",
                "revenue": "revenue",
            },
            mapping_confidence={key: 1.0 for key in ["sku", "product_name", "stock_units", "unit_cost", "sale_price", "units_sold", "revenue"]},
            validation={"missing_required_fields": [], "quality_score": 100, "quality_label": "Alta"},
            normalized_df=df,
            business_profile=self._profile(),
        )

        self.assertTrue(response["decisions"])
        self.assertTrue(all("economic_driver_tree" in decision for decision in response["decisions"]))

    def test_real_workbook_smoke_if_available(self):
        path = Path("/Users/benataguirrezabalaga/Downloads/businessgoal_dataset_retail_realista.xlsx")
        if not path.exists():
            self.skipTest("REAL WORKBOOK SMOKE: NOT EXECUTED — FILE NOT AVAILABLE.")

        df = read_uploaded_file(path.name, path.read_bytes())
        mapping_result = detect_columns(df)
        final_mapping = mapping_result.mapping
        validation = validate_file(df, final_mapping, mapping_result.confidence, infer_file_type(final_mapping))
        self.assertTrue(validation["can_analyze"])
        normalized = normalize_dataframe(df, final_mapping)
        response = _build_analysis_response(
            file_name=path.name,
            rows=int(df.shape[0]),
            columns=int(df.shape[1]),
            detected_columns=mapping_result.detected_columns,
            column_mapping=final_mapping,
            mapping_confidence=mapping_result.confidence,
            validation=validation,
            normalized_df=normalized,
            business_profile=self._profile(),
        )

        json.dumps(response, allow_nan=False)
        self.assertGreater(len(response.get("decisions") or []), 0)
        self.assertTrue(all("economic_driver_tree" in decision for decision in response["decisions"]))


if __name__ == "__main__":
    unittest.main()
