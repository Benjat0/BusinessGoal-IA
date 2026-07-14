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
from core.decision_scenario_engine import build_decision_scenarios
from core.kpi_engine import enrich_product_metrics
from main import (
    _build_analysis_response,
    detect_columns,
    infer_file_type,
    normalize_dataframe,
    read_uploaded_file,
    validate_file,
)


class V206DecisionScenarioTests(unittest.TestCase):
    def _decision(self, **overrides):
        base = {
            "id": "decision-1",
            "decision_type": "excess_stock",
            "category": "cash_release",
            "estimated_impact": 1000.0,
            "confidence": 86,
            "horizon_days": 30,
        }
        base.update(overrides)
        return base

    def _recommendation(self, **overrides):
        base = {
            "type": "excess_stock",
            "category": "cash_release",
            "priority": "high",
            "economic_impact": 1000.0,
            "confidence_level": 86,
            "title": "Reducir sobrestock",
            "what_happens": "Producto con cobertura elevada.",
            "why_it_matters": "Hay caja bloqueada.",
            "recommended_action": "Revisar stock objetivo.",
            "first_step": "Ordenar productos por valor de inventario.",
            "expected_business_effect": "Reducir exposición de inventario.",
            "timeframe": "30 días",
            "affected_products_count": 1,
            "detail_items": [
                {
                    "product": "SKU 1",
                    "impact": 1000.0,
                    "priority": "high",
                    "confidence_level": 86,
                    "what_happens": "Cobertura elevada.",
                    "kpi_snapshot": {"stock_units": 40, "inventory_value": 1000},
                }
            ],
        }
        base.update(overrides)
        return base

    def _enriched(self):
        return enrich_product_metrics(pd.DataFrame([
            {
                "sku": "SKU-1",
                "product_name": "SKU 1",
                "stock_units": 40,
                "unit_cost": 10,
                "sale_price": 20,
                "units_sold": 2,
                "revenue": 40,
            }
        ]))

    def test_cash_release_decision_generates_three_scenarios(self):
        scenarios = build_decision_scenarios(self._decision())

        self.assertEqual(len(scenarios), 3)
        self.assertEqual([scenario["scenario_key"] for scenario in scenarios], ["conservative", "recommended", "intensive"])
        self.assertTrue(all(scenario["scenario_type"] == "STOCK_REDUCTION" for scenario in scenarios))

    def test_recommended_scenario_is_the_only_recommended_option(self):
        scenarios = build_decision_scenarios(self._decision())

        self.assertEqual([scenario["recommended"] for scenario in scenarios], [False, True, False])

    def test_cash_release_effects_are_category_compatible(self):
        recommended = build_decision_scenarios(self._decision())[1]
        effects = recommended["estimated_effects"]

        self.assertEqual(effects["cash_release_estimate"], 1000.0)
        self.assertIsNone(effects["margin_improvement_estimate"])
        self.assertIsNone(effects["gross_margin_protected_estimate"])
        self.assertEqual(effects["net_economic_estimate"], 1000.0)
        self.assertIn("La caja liberable no debe interpretarse como beneficio.", recommended["warnings"])

    def test_margin_decision_generates_price_parameters_and_elasticity_warning(self):
        scenarios = build_decision_scenarios(
            self._decision(decision_type="low_margin_high_sales", category="margin_improvement", estimated_impact=500.0),
            {"target_margin_pct": 35, "low_margin_pct": 20},
        )

        self.assertEqual(scenarios[1]["scenario_type"], "MARGIN_REVIEW")
        self.assertEqual(scenarios[1]["parameters"]["price_adjustment_pct"], 5)
        self.assertEqual(scenarios[1]["estimated_effects"]["margin_improvement_estimate"], 500.0)
        self.assertIn("El efecto depende de elasticidad de demanda no estimada con estos datos.", scenarios[1]["warnings"])

    def test_stockout_decision_generates_protection_effect_and_warning(self):
        scenarios = build_decision_scenarios(
            self._decision(decision_type="stockout_risk", category="sales_protection", estimated_impact=700.0),
        )

        self.assertEqual(scenarios[2]["scenario_type"], "STOCKOUT_PROTECTION")
        self.assertEqual(scenarios[2]["parameters"]["demand_window_days"], 30)
        self.assertEqual(scenarios[2]["estimated_effects"]["gross_margin_protected_estimate"], 1050.0)
        self.assertIn("El margen expuesto no equivale a venta perdida confirmada.", scenarios[2]["warnings"])

    def test_generic_fallback_generates_three_prudent_scenarios(self):
        scenarios = build_decision_scenarios(
            self._decision(decision_type="unknown", category="other", estimated_impact=300.0),
        )

        self.assertEqual(len(scenarios), 3)
        self.assertTrue(all(scenario["scenario_type"] == "GENERIC" for scenario in scenarios))
        self.assertIsNone(scenarios[1]["estimated_effects"]["net_economic_estimate"])
        self.assertIn("Faltan reglas específicas para esta decisión; los escenarios son prudentes y orientativos.", scenarios[1]["warnings"])

    def test_scenarios_are_strict_json_serializable(self):
        payload = [
            *build_decision_scenarios(self._decision()),
            *build_decision_scenarios(self._decision(estimated_impact=float("nan"))),
        ]

        json.dumps(payload, allow_nan=False)

    def test_scenarios_are_integrated_in_build_decisions(self):
        decisions = build_decisions(
            analysis_id="analysis-1",
            analysis_created_at="2026-07-14T12:00:00Z",
            consolidated_recommendations=[self._recommendation()],
            enriched=self._enriched(),
            business_profile={"max_coverage_days": 160},
        )

        self.assertEqual(len(decisions), 1)
        self.assertIn("scenario_options", decisions[0])
        self.assertEqual(len(decisions[0]["scenario_options"]), 3)
        self.assertEqual(decisions[0]["scenario_options"][1]["parameters"]["target_coverage_days"], 160)

    def test_sparse_or_missing_estimated_impact_does_not_break(self):
        scenarios = build_decision_scenarios(self._decision(estimated_impact=None))

        self.assertEqual(len(scenarios), 3)
        self.assertIsNone(scenarios[1]["estimated_effects"]["cash_release_estimate"])
        self.assertIn("La decisión no incluye una magnitud económica suficiente; las cifras se mantienen sin estimación cuantitativa.", scenarios[1]["warnings"])
        json.dumps(scenarios, allow_nan=False)

    def test_real_workbook_decisions_have_scenario_options(self):
        path = Path("/Users/benataguirrezabalaga/Downloads/businessgoal_dataset_retail_realista.xlsx")
        if not path.exists():
            self.skipTest("REAL WORKBOOK SMOKE: NOT EXECUTED — FILE NOT AVAILABLE.")

        df = read_uploaded_file(path.name, path.read_bytes())
        mapping_result = detect_columns(df)
        final_mapping = mapping_result.mapping
        validation = validate_file(df, final_mapping, mapping_result.confidence, infer_file_type(final_mapping))
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

        self.assertTrue(response["decisions"])
        self.assertTrue(all(len(decision.get("scenario_options", [])) == 3 for decision in response["decisions"]))
        json.dumps(response["decisions"], allow_nan=False)


if __name__ == "__main__":
    unittest.main()
