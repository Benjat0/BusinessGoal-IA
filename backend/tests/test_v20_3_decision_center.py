from __future__ import annotations

import json
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


class V203DecisionCenterTests(unittest.TestCase):
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
                    "kpi_snapshot": {
                        "stock_units": 12,
                        "units_sold": 0,
                        "inventory_value": 120,
                        "gross_margin_pct": None,
                        "gross_profit_estimated": None,
                        "stock_coverage_days": None,
                        "stock_turnover_90d": None,
                    },
                }
            ],
        }
        base.update(overrides)
        return base

    def _decisions(self, recommendations=None, *, analysis_id: str = "analysis-1", enriched: pd.DataFrame | None = None):
        return build_decisions(
            analysis_id=analysis_id,
            analysis_created_at="2026-07-11T12:00:00Z",
            consolidated_recommendations=recommendations if recommendations is not None else [self._recommendation()],
            enriched=enriched if enriched is not None else self._enriched(),
        )

    def test_consolidated_recommendation_generates_pending_decision(self):
        decision = self._decisions()[0]

        self.assertEqual(decision["status"], "PENDING")
        self.assertEqual(decision["estimated_impact"], 120.0)
        self.assertEqual(decision["recommended_action"], "Crear una campaña de liquidación.")

    def test_deterministic_id_with_same_analysis_and_key(self):
        first = self._decisions()[0]
        second = self._decisions()[0]

        self.assertEqual(first["id"], second["id"])

    def test_distinct_id_with_distinct_analysis(self):
        first = self._decisions(analysis_id="analysis-1")[0]
        second = self._decisions(analysis_id="analysis-2")[0]

        self.assertNotEqual(first["id"], second["id"])

    def test_stable_decision_key_cross_analysis(self):
        first = self._decisions(analysis_id="analysis-1")[0]
        second = self._decisions(analysis_id="analysis-2")[0]

        self.assertEqual(first["decision_key"], second["decision_key"])
        self.assertEqual(first["decision_key"], "dead_stock:cash_release")

    def test_cash_release_mapping(self):
        decision = self._decisions([self._recommendation(category="cash_release")])[0]

        self.assertEqual(decision["impact_category"], "CASH_RELEASE")
        self.assertEqual(decision["impact_label"], "Caja liberable")

    def test_margin_improvement_mapping(self):
        rec = self._recommendation(type="low_margin_high_sales", category="margin_improvement")
        decision = self._decisions([rec])[0]

        self.assertEqual(decision["impact_category"], "MARGIN_OPPORTUNITY")
        self.assertEqual(decision["impact_label"], "Margen mejorable")

    def test_sales_protection_mapping(self):
        rec = self._recommendation(type="stockout_risk", category="sales_protection")
        decision = self._decisions([rec])[0]

        self.assertEqual(decision["impact_category"], "GROSS_MARGIN_AT_RISK")
        self.assertEqual(decision["impact_label"], "Margen expuesto")

    def test_no_additive_total_fields_are_used(self):
        rec = self._recommendation(
            economic_impact=321.0,
            display_total=999999,
            potential_recoverable_benefit=999999,
            total_impact=999999,
        )
        decision = self._decisions([rec])[0]

        self.assertEqual(decision["estimated_impact"], 321.0)

    def test_horizon_map_for_known_types(self):
        expected = {
            "excess_stock": 30,
            "dead_stock": 14,
            "low_margin_high_sales": 30,
            "stockout_risk": 7,
        }

        for rec_type, days in expected.items():
            with self.subTest(rec_type=rec_type):
                decision = self._decisions([self._recommendation(type=rec_type)])[0]
                self.assertEqual(decision["horizon_days"], days)

    def test_evidence_ids_are_deterministic(self):
        first = self._decisions()[0]["evidence_items"][0]
        second = self._decisions()[0]["evidence_items"][0]

        self.assertEqual(first["id"], second["id"])

    def test_product_ref_sku_resolvable(self):
        decision = self._decisions()[0]
        ref = decision["evidence_items"][0]["product_ref"]

        self.assertEqual(ref["identity_type"], "SKU")
        self.assertEqual(ref["sku"], "SKU-1")
        self.assertEqual(ref["warnings"], [])

    def test_product_ref_fallback_with_warning(self):
        enriched = self._enriched(include_sku=False)
        decision = self._decisions(enriched=enriched)[0]
        ref = decision["evidence_items"][0]["product_ref"]

        self.assertEqual(ref["identity_type"], "NORMALIZED_NAME")
        self.assertIn("product_identity_uses_normalized_name", ref["warnings"])

    def test_kpi_snapshot_preserves_null_semantics(self):
        snapshot = self._decisions()[0]["evidence_items"][0]["kpi_snapshot"]

        self.assertEqual(snapshot["units_sold"], 0)
        self.assertIsNone(snapshot["gross_margin_pct"])

    def test_decisions_are_strict_json_serializable(self):
        decisions = self._decisions()

        json.dumps(decisions, allow_nan=False)

    def test_empty_consolidated_recommendations_returns_empty_decisions(self):
        self.assertEqual(self._decisions([]), [])

    def test_order_preserves_consolidated_recommendations(self):
        first = self._recommendation(type="stockout_risk", category="sales_protection", title="A")
        second = self._recommendation(type="dead_stock", category="cash_release", title="B")
        decisions = self._decisions([first, second])

        self.assertEqual([item["rank"] for item in decisions], [1, 2])
        self.assertEqual([item["title"] for item in decisions], ["A", "B"])

    def test_build_analysis_response_returns_source_decisions(self):
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
        )

        self.assertIn("decisions", response)
        self.assertTrue(response["decisions"])
        self.assertTrue(all(item["source_analysis_id"] == response["analysis_id"] for item in response["decisions"]))

    def test_sparse_full_response_remains_json_safe(self):
        df = pd.DataFrame([
            {
                "sku": "SKU-SPARSE",
                "product_name": "Sparse",
                "stock_units": 1,
                "unit_cost": None,
                "sale_price": None,
                "units_sold": None,
            }
        ])
        response = _build_analysis_response(
            file_name="sparse.csv",
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
            },
            mapping_confidence={key: 1.0 for key in ["sku", "product_name", "stock_units", "unit_cost", "sale_price", "units_sold"]},
            validation={"missing_required_fields": [], "quality_score": 100, "quality_label": "Alta"},
            normalized_df=df,
        )

        json.dumps(response, allow_nan=False)

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
        )

        json.dumps(response, allow_nan=False)
        if response.get("consolidated_recommendations"):
            self.assertIn("decisions", response)
            self.assertTrue(response["decisions"])


if __name__ == "__main__":
    unittest.main()
