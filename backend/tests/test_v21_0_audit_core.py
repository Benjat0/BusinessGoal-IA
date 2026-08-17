from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.audit_core import build_audit_core


class AuditCoreTests(unittest.TestCase):
    def _build(self, **overrides):
        payload = {
            "validation": {"quality_score": 100},
            "column_mapping": {
                "sku": "SKU",
                "product_name": "Producto",
                "stock_units": "Stock",
                "unit_cost": "Coste",
                "sale_price": "Precio",
                "units_sold": "Ventas",
                "revenue": "Ingresos",
            },
            "mapping_confidence": {
                "sku": 1,
                "product_name": 1,
                "stock_units": 1,
                "unit_cost": 1,
                "sale_price": 1,
                "units_sold": 1,
                "revenue": 1,
            },
            "metric_coverage": {
                "inventory_value": 1,
                "revenue": 1,
                "gross_profit_estimated": 1,
                "stock_coverage_days": 1,
                "stock_turnover_90d": 1,
                "units_sold": 1,
            },
            "retail_template_fit": {"confidence": "HIGH"},
            "merge_summary": {"merge_quality_score": 100},
        }
        payload.update(overrides)
        return build_audit_core(**payload)

    def test_full_catalog_data_assesses_retail_economic_areas(self):
        audit = self._build()

        areas = {area["key"]: area for area in audit["areas"]}
        self.assertEqual(audit["data_readiness"]["score"], 100)
        self.assertEqual(audit["scope_status"], "PARTIAL_AUDIT")
        self.assertEqual(areas["data_quality"]["status"], "ASSESSED")
        self.assertEqual(areas["profitability"]["status"], "ASSESSED")
        self.assertEqual(areas["inventory"]["status"], "ASSESSED")
        self.assertEqual(areas["sales"]["status"], "ASSESSED")
        self.assertEqual(areas["customers"]["status"], "NOT_ASSESSED")
        self.assertEqual(areas["operations"]["status"], "NOT_ASSESSED")

    def test_audit_does_not_invent_global_business_health_score(self):
        audit = self._build()

        health = audit["business_health_score"]
        self.assertFalse(health["available"])
        self.assertIsNone(health["score"])
        self.assertIn("No se calcula", health["reason"])

    def test_sparse_data_marks_areas_not_assessed_and_requests_inputs(self):
        audit = self._build(
            validation={"quality_score": 45},
            column_mapping={"product_name": "Producto", "stock_units": "Stock"},
            mapping_confidence={"product_name": 1, "stock_units": 1},
            metric_coverage={
                "inventory_value": 0,
                "revenue": 0,
                "gross_profit_estimated": 0,
                "stock_coverage_days": 0,
                "stock_turnover_90d": 0,
                "units_sold": 0,
            },
            retail_template_fit={"confidence": "LOW"},
            merge_summary=None,
        )

        areas = {area["key"]: area for area in audit["areas"]}
        self.assertLess(audit["data_readiness"]["score"], 50)
        self.assertEqual(areas["profitability"]["status"], "NOT_ASSESSED")
        self.assertEqual(areas["inventory"]["status"], "NOT_ASSESSED")
        self.assertIn("Coste unitario o coste de compra", audit["recommended_next_inputs"])
        self.assertGreaterEqual(len(audit["limitations"]), 4)

    def test_result_is_strict_json_serializable(self):
        json.dumps(self._build(), allow_nan=False)


if __name__ == "__main__":
    unittest.main()
