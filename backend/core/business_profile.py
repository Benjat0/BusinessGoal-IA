from __future__ import annotations

import json
from typing import Any, Dict, Optional

DEFAULT_BUSINESS_PROFILE: Dict[str, Any] = {
    "company_name": "Empresa demo",
    "sector": "retail",
    "analysis_goal": "balanced",
    "target_margin_pct": 35.0,
    "low_margin_pct": 20.0,
    "max_coverage_days": 180.0,
    "dead_stock_days": 365.0,
    "stockout_sensitivity": 0.15,
    "min_sales_for_restock": 20.0,
    "min_sales_for_margin_alert": 10.0,
    "high_impact_threshold": 1500.0,
    "medium_impact_threshold": 350.0,
}

SECTOR_PRESETS: Dict[str, Dict[str, Any]] = {
    "retail": {
        "label": "Retail / comercio",
        "target_margin_pct": 35.0,
        "low_margin_pct": 20.0,
        "max_coverage_days": 180.0,
        "stockout_sensitivity": 0.15,
        "min_sales_for_restock": 20.0,
        "min_sales_for_margin_alert": 10.0,
    },
    "ecommerce": {
        "label": "E-commerce",
        "target_margin_pct": 32.0,
        "low_margin_pct": 18.0,
        "max_coverage_days": 120.0,
        "stockout_sensitivity": 0.20,
        "min_sales_for_restock": 15.0,
        "min_sales_for_margin_alert": 8.0,
    },
    "distribution": {
        "label": "Distribución / mayorista",
        "target_margin_pct": 25.0,
        "low_margin_pct": 12.0,
        "max_coverage_days": 210.0,
        "stockout_sensitivity": 0.12,
        "min_sales_for_restock": 30.0,
        "min_sales_for_margin_alert": 15.0,
    },
    "manufacturing": {
        "label": "Fabricación / producción",
        "target_margin_pct": 30.0,
        "low_margin_pct": 16.0,
        "max_coverage_days": 240.0,
        "stockout_sensitivity": 0.10,
        "min_sales_for_restock": 20.0,
        "min_sales_for_margin_alert": 10.0,
    },
}

ANALYSIS_GOAL_PRESETS: Dict[str, Dict[str, Any]] = {
    "cash": {"label": "Liberar caja", "max_coverage_days_delta": -30, "high_impact_multiplier": 0.85},
    "margin": {"label": "Mejorar margen", "low_margin_delta": 3, "target_margin_delta": 3},
    "growth": {"label": "Evitar ventas perdidas", "stockout_sensitivity_delta": 0.05, "min_sales_for_restock_delta": -5},
    "balanced": {"label": "Equilibrado",},
}


def _to_float(value: Any, default: float) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return default
    return numeric if numeric == numeric else default


def normalize_business_profile(profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    profile = profile or {}
    sector = str(profile.get("sector") or DEFAULT_BUSINESS_PROFILE["sector"])
    if sector not in SECTOR_PRESETS:
        sector = "retail"
    goal = str(profile.get("analysis_goal") or DEFAULT_BUSINESS_PROFILE["analysis_goal"])
    if goal not in ANALYSIS_GOAL_PRESETS:
        goal = "balanced"

    merged: Dict[str, Any] = {**DEFAULT_BUSINESS_PROFILE, **SECTOR_PRESETS[sector], **profile, "sector": sector, "analysis_goal": goal}

    target_margin = _to_float(merged.get("target_margin_pct"), DEFAULT_BUSINESS_PROFILE["target_margin_pct"])
    low_margin = _to_float(merged.get("low_margin_pct"), max(10.0, target_margin * 0.55))
    max_coverage = _to_float(merged.get("max_coverage_days"), DEFAULT_BUSINESS_PROFILE["max_coverage_days"])
    stockout_sensitivity = _to_float(merged.get("stockout_sensitivity"), DEFAULT_BUSINESS_PROFILE["stockout_sensitivity"])
    min_restock = _to_float(merged.get("min_sales_for_restock"), DEFAULT_BUSINESS_PROFILE["min_sales_for_restock"])
    min_margin = _to_float(merged.get("min_sales_for_margin_alert"), DEFAULT_BUSINESS_PROFILE["min_sales_for_margin_alert"])
    high_threshold = _to_float(merged.get("high_impact_threshold"), DEFAULT_BUSINESS_PROFILE["high_impact_threshold"])
    medium_threshold = _to_float(merged.get("medium_impact_threshold"), DEFAULT_BUSINESS_PROFILE["medium_impact_threshold"])

    goal_preset = ANALYSIS_GOAL_PRESETS[goal]
    target_margin += _to_float(goal_preset.get("target_margin_delta"), 0.0)
    low_margin += _to_float(goal_preset.get("low_margin_delta"), 0.0)
    max_coverage += _to_float(goal_preset.get("max_coverage_days_delta"), 0.0)
    stockout_sensitivity += _to_float(goal_preset.get("stockout_sensitivity_delta"), 0.0)
    min_restock += _to_float(goal_preset.get("min_sales_for_restock_delta"), 0.0)
    high_threshold *= _to_float(goal_preset.get("high_impact_multiplier"), 1.0)

    target_margin = max(5.0, min(80.0, target_margin))
    low_margin = max(1.0, min(target_margin, low_margin))
    max_coverage = max(30.0, min(720.0, max_coverage))
    stockout_sensitivity = max(0.02, min(0.50, stockout_sensitivity))
    min_restock = max(1.0, min(200.0, min_restock))
    min_margin = max(1.0, min(200.0, min_margin))

    normalized = {
        "company_name": str(merged.get("company_name") or "Empresa demo"),
        "sector": sector,
        "sector_label": SECTOR_PRESETS[sector]["label"],
        "analysis_goal": goal,
        "analysis_goal_label": ANALYSIS_GOAL_PRESETS[goal]["label"],
        "target_margin_pct": round(target_margin, 2),
        "low_margin_pct": round(low_margin, 2),
        "max_coverage_days": round(max_coverage, 2),
        "dead_stock_days": round(_to_float(merged.get("dead_stock_days"), 365.0), 2),
        "stockout_sensitivity": round(stockout_sensitivity, 3),
        "min_sales_for_restock": round(min_restock, 2),
        "min_sales_for_margin_alert": round(min_margin, 2),
        "high_impact_threshold": round(max(100.0, high_threshold), 2),
        "medium_impact_threshold": round(max(50.0, medium_threshold), 2),
    }
    return normalized


def parse_business_profile(profile_json: Optional[str] = None) -> Dict[str, Any]:
    if not profile_json:
        return normalize_business_profile()
    try:
        parsed = json.loads(profile_json)
    except json.JSONDecodeError:
        parsed = {}
    if not isinstance(parsed, dict):
        parsed = {}
    return normalize_business_profile(parsed)


def business_profile_options() -> Dict[str, Any]:
    return {
        "default_profile": normalize_business_profile(),
        "sectors": [
            {"value": key, "label": value["label"]}
            for key, value in SECTOR_PRESETS.items()
        ],
        "analysis_goals": [
            {"value": key, "label": value["label"]}
            for key, value in ANALYSIS_GOAL_PRESETS.items()
        ],
    }
