from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import _build_business_status


class BusinessStatusTests(unittest.TestCase):
    def test_heterogeneous_large_margin_values_do_not_force_priority(self):
        status = _build_business_status(
            {
                "cash_release_potential": 100,
                "total_inventory_value": 1000,
                "margin_improvement_potential": 100000,
                "sales_protection_potential": 100000,
            },
            [
                {"priority": "medium", "type": "low_margin_high_sales", "category": "margin_improvement", "economic_impact": 100000},
                {"priority": "low", "type": "stockout_risk", "category": "sales_protection", "economic_impact": 100000},
            ],
        )

        self.assertNotEqual(status["status"], "Atención prioritaria")
        self.assertEqual(status["status"], "Mejora disponible")
        self.assertEqual(status["signals"]["capital_pressure_pct"], 10.0)

    def test_high_capital_pressure_is_priority(self):
        status = _build_business_status(
            {"cash_release_potential": 700, "total_inventory_value": 1000},
            [{"priority": "medium", "type": "excess_stock", "category": "cash_release", "economic_impact": 700}],
        )

        self.assertEqual(status["status"], "Atención prioritaria")
        self.assertEqual(status["tone"], "warning")
        self.assertIn("capital", status["message"].lower())

    def test_many_high_priority_items_are_priority(self):
        status = _build_business_status(
            {"cash_release_potential": 0, "total_inventory_value": 1000},
            [{"priority": "high", "type": "low_margin_high_sales", "category": "margin_improvement", "economic_impact": 10} for _ in range(5)],
        )

        self.assertEqual(status["status"], "Atención prioritaria")
        self.assertEqual(status["signals"]["high_priority_count"], 5)

    def test_without_alerts_is_controlled(self):
        status = _build_business_status(
            {"cash_release_potential": 0, "total_inventory_value": 1000},
            [],
        )

        self.assertEqual(status["status"], "Situación controlada")
        self.assertEqual(status["tone"], "positive")


if __name__ == "__main__":
    unittest.main()
