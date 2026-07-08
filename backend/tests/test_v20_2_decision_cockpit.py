from __future__ import annotations

import sys
import unittest
from copy import deepcopy
from pathlib import Path

from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.analysis_comparison import build_analysis_comparison
from main import compare_analysis_snapshots_endpoint


def _snapshot(
    analysis_id: str,
    *,
    summary: dict,
    product_ids: list[str] | None = None,
    period_days: int = 90,
) -> dict:
    ids = product_ids if product_ids is not None else ["SKU-1", "SKU-2", "SKU-3"]
    return {
        "analysis_id": analysis_id,
        "analysis_created_at": "2026-07-05T12:00:00Z",
        "analysis_period": {
            "kind": "ASSUMED_WINDOW",
            "start_date": None,
            "end_date": None,
            "days": period_days,
            "label": "Ventana asumida: 90 dias",
            "confidence": 0.35,
            "source": "TEST",
        },
        "business_profile_digest": {
            "sector": "retail",
            "analysis_goal": "balanced",
            "target_margin_pct": 35,
            "low_margin_pct": 20,
            "max_coverage_days": 180,
        },
        "summary_kpis": summary,
        "economic_value_summary": {
            "display_total": 0,
            "display_total_role": "LEGACY_DIMENSIONAL_SUM",
            "display_total_recommended_for_hero": False,
            "categories": [],
        },
        "product_metrics": [
            {
                "product_ref": {
                    "identity_key": f"sku:{product_id.lower()}",
                    "identity_type": "SKU",
                    "identity_confidence": 0.96,
                },
                "metrics": {
                    "stock_units": 10,
                    "units_sold": 4,
                    "revenue": 100,
                    "gross_margin_pct": 30,
                    "stock_coverage_days": 30,
                    "inventory_value": 120,
                },
            }
            for product_id in ids
        ],
        "product_count": len(ids),
        "product_metrics_count": len(ids),
        "product_metrics_truncated": False,
        "recommendation_digest": {"count": 0, "by_category": {}, "by_type": {}, "top_recommendation_refs": []},
        "data_quality": {
            "quality_score": 90,
            "quality_label": "Alta",
            "mapping_confidence": {"sku": 1},
            "mapped_fields": ["sku", "product_name", "stock_units", "units_sold", "unit_cost", "sale_price"],
            "missing_required_fields": [],
        },
        "comparability_metadata": {
            "source_roles": {"combined_files": 1, "inventory_files": 0, "sales_files": 0},
            "join_strategy": "SKU",
            "identity_warnings": 0,
            "metric_coverage": {
                "stock_units": 1,
                "units_sold": 1,
                "revenue": 1,
                "gross_margin_pct": 1,
                "stock_coverage_days": 1,
                "inventory_value": 1,
            },
            "snapshot_product_limit": 250,
        },
    }


def _with_coverage(snapshot: dict, **coverage: float) -> dict:
    updated = deepcopy(snapshot)
    updated["comparability_metadata"]["metric_coverage"].update(coverage)
    return updated


def _without_coverage(snapshot: dict, *keys: str) -> dict:
    updated = deepcopy(snapshot)
    for key in keys:
        updated["comparability_metadata"]["metric_coverage"].pop(key, None)
    return updated


class V202DecisionCockpitTests(unittest.TestCase):
    def test_builds_whitelisted_comparable_metric_changes(self):
        baseline = _snapshot(
            "baseline",
            summary={
                "business_score_current": 70,
                "cash_release_potential": 1000,
                "average_margin_pct": 30,
                "products_without_sales": 8,
                "high_stock_low_sales_products": 5,
                "total_inventory_value": 12000,
                "display_total": 999999,
            },
        )
        candidate = _snapshot(
            "candidate",
            summary={
                "business_score_current": 75,
                "cash_release_potential": 800,
                "average_margin_pct": 32.5,
                "products_without_sales": 6,
                "high_stock_low_sales_products": 5,
                "total_inventory_value": 12500,
                "potential_recoverable_benefit": 999999,
            },
        )

        result = build_analysis_comparison(baseline, candidate)

        self.assertEqual(result["status"], "COMPARABLE")
        self.assertLessEqual(len(result["changes"]), 4)
        self.assertEqual([change["key"] for change in result["changes"]], [
            "cash_release_potential",
            "average_margin_pct",
            "products_without_sales",
            "business_score_current",
        ])
        self.assertEqual(result["changes"][0]["movement"], "DOWN")
        self.assertEqual(result["changes"][0]["signal"], "POSITIVE")
        margin_change = result["changes"][1]
        self.assertEqual(margin_change["delta"], 2.5)
        self.assertEqual(margin_change["delta_unit"], "percentage_points")
        self.assertNotIn("delta_pct", margin_change)

    def test_zero_baseline_does_not_emit_delta_pct(self):
        baseline = _snapshot(
            "baseline",
            summary={
                "business_score_current": 70,
                "cash_release_potential": 0,
                "average_margin_pct": 0,
            },
        )
        candidate = _snapshot(
            "candidate",
            summary={
                "business_score_current": 70,
                "cash_release_potential": 120,
                "average_margin_pct": 4,
            },
        )

        result = build_analysis_comparison(baseline, candidate)
        cash_change = next(change for change in result["changes"] if change["key"] == "cash_release_potential")

        self.assertNotIn("delta_pct", cash_change)

    def test_neutral_inventory_metric_generates_neutral_signal(self):
        baseline = _snapshot("baseline", summary={"total_inventory_value": 10000})
        candidate = _snapshot("candidate", summary={"total_inventory_value": 12000})

        result = build_analysis_comparison(baseline, candidate)

        self.assertEqual(len(result["changes"]), 1)
        change = result["changes"][0]
        self.assertEqual(change["key"], "total_inventory_value")
        self.assertEqual(change["movement"], "UP")
        self.assertEqual(change["signal"], "NEUTRAL")

    def test_missing_margin_coverage_blocks_artificial_zero_baseline(self):
        baseline = _with_coverage(
            _snapshot("baseline", summary={"average_margin_pct": 0}),
            gross_margin_pct=0,
        )
        candidate = _snapshot("candidate", summary={"average_margin_pct": 25})

        result = build_analysis_comparison(baseline, candidate)

        self.assertNotIn("average_margin_pct", [change["key"] for change in result["changes"]])

    def test_missing_margin_coverage_blocks_artificial_zero_candidate(self):
        baseline = _snapshot("baseline", summary={"average_margin_pct": 25})
        candidate = _with_coverage(
            _snapshot("candidate", summary={"average_margin_pct": 0}),
            gross_margin_pct=0,
        )

        result = build_analysis_comparison(baseline, candidate)

        self.assertNotIn("average_margin_pct", [change["key"] for change in result["changes"]])

    def test_required_multi_coverage_must_all_be_sufficient(self):
        baseline = _snapshot("baseline", summary={"high_stock_low_sales_products": 8})
        candidate = _with_coverage(
            _snapshot("candidate", summary={"high_stock_low_sales_products": 4}),
            stock_units=1,
            units_sold=0,
        )

        result = build_analysis_comparison(baseline, candidate)

        self.assertNotIn("high_stock_low_sales_products", [change["key"] for change in result["changes"]])

    def test_missing_coverage_key_is_not_available(self):
        baseline = _without_coverage(_snapshot("baseline", summary={"total_inventory_value": 10000}), "inventory_value")
        candidate = _snapshot("candidate", summary={"total_inventory_value": 12000})

        result = build_analysis_comparison(baseline, candidate)

        self.assertEqual(result["changes"], [])

    def test_business_score_requires_two_core_signal_coverages(self):
        baseline = _with_coverage(
            _snapshot("baseline", summary={"business_score_current": 70}),
            stock_units=1,
            units_sold=0,
            gross_margin_pct=0,
        )
        candidate = _snapshot("candidate", summary={"business_score_current": 80})

        result = build_analysis_comparison(baseline, candidate)

        self.assertEqual(result["changes"], [])

    def test_partial_comparison_limits_visible_changes_to_three(self):
        baseline = _snapshot(
            "baseline",
            summary={
                "business_score_current": 70,
                "cash_release_potential": 1000,
                "average_margin_pct": 30,
                "products_without_sales": 8,
                "high_stock_low_sales_products": 5,
                "total_inventory_value": 12000,
            },
        )
        candidate = _snapshot(
            "candidate",
            summary={
                "business_score_current": 72,
                "cash_release_potential": 900,
                "average_margin_pct": 31,
                "products_without_sales": 7,
                "high_stock_low_sales_products": 4,
                "total_inventory_value": 11800,
            },
            period_days=30,
        )
        candidate["business_profile_digest"]["analysis_goal"] = "cash"

        result = build_analysis_comparison(baseline, candidate)

        self.assertEqual(result["status"], "PARTIALLY_COMPARABLE")
        self.assertEqual(len(result["changes"]), 3)
        self.assertTrue(result["limit_applied"])

    def test_limit_applies_after_invalid_and_flat_metrics_are_filtered(self):
        baseline = _with_coverage(
            _snapshot(
                "baseline",
                summary={
                    "cash_release_potential": 1000,
                    "average_margin_pct": 30,
                    "products_without_sales": 8,
                    "high_stock_low_sales_products": 5,
                    "business_score_current": 70,
                    "total_inventory_value": 10000,
                },
            ),
            inventory_value=0,
        )
        candidate = _with_coverage(
            _snapshot(
                "candidate",
                summary={
                    "cash_release_potential": 900,
                    "average_margin_pct": 30,
                    "products_without_sales": 7,
                    "high_stock_low_sales_products": 4,
                    "business_score_current": 72,
                    "total_inventory_value": 11000,
                },
            ),
            inventory_value=0,
        )
        candidate["comparability_metadata"]["metric_coverage"]["inventory_value"] = 1

        result = build_analysis_comparison(baseline, candidate)

        self.assertEqual([change["key"] for change in result["changes"]], [
            "products_without_sales",
            "high_stock_low_sales_products",
            "business_score_current",
        ])

    def test_flat_metrics_do_not_generate_visible_changes(self):
        baseline = _snapshot("baseline", summary={"cash_release_potential": 1000})
        candidate = _snapshot("candidate", summary={"cash_release_potential": 1000})

        result = build_analysis_comparison(baseline, candidate)

        self.assertEqual(result["changes"], [])

    def test_not_comparable_returns_no_metric_changes(self):
        baseline = _snapshot("baseline", summary={"business_score_current": 70})
        candidate = _snapshot(
            "candidate",
            summary={"business_score_current": 80},
            product_ids=[],
            period_days=30,
        )
        candidate["comparability_metadata"]["metric_coverage"] = {}

        result = build_analysis_comparison(baseline, candidate)

        self.assertEqual(result["status"], "NOT_COMPARABLE")
        self.assertEqual(result["changes"], [])

    def test_endpoint_rejects_invalid_payload(self):
        with self.assertRaises(HTTPException) as exc:
            compare_analysis_snapshots_endpoint({
                "baseline_snapshot": _snapshot("baseline", summary={"business_score_current": 70}),
            })

        self.assertEqual(exc.exception.status_code, 400)
        self.assertIn("candidate_snapshot", str(exc.exception.detail))

    def test_endpoint_accepts_valid_payload(self):
        response = compare_analysis_snapshots_endpoint({
            "baseline_snapshot": _snapshot("baseline", summary={"cash_release_potential": 1000}),
            "candidate_snapshot": _snapshot("candidate", summary={"cash_release_potential": 800}),
        })

        self.assertEqual(response["baseline_analysis_id"], "baseline")
        self.assertEqual(response["candidate_analysis_id"], "candidate")
        self.assertEqual(response["status"], "COMPARABLE")
        self.assertEqual(response["changes"][0]["key"], "cash_release_potential")
        self.assertIn("comparabilidad", response["explanation"])

    def test_self_comparison_rejected(self):
        snapshot = _snapshot("same", summary={"cash_release_potential": 1000})

        with self.assertRaises(ValueError):
            build_analysis_comparison(snapshot, snapshot)

        with self.assertRaises(HTTPException) as exc:
            compare_analysis_snapshots_endpoint({
                "baseline_snapshot": snapshot,
                "candidate_snapshot": snapshot,
            })

        self.assertEqual(exc.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
