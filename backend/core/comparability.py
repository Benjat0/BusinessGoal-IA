from __future__ import annotations

from typing import Any, Dict, List, Set


def _product_keys(snapshot: Dict[str, Any]) -> Set[str]:
    keys: Set[str] = set()
    for product in snapshot.get("product_metrics", []):
        key = (product.get("product_ref") or {}).get("identity_key")
        if key:
            keys.add(str(key))
    return keys


def _metric_coverage_score(snapshot: Dict[str, Any]) -> float:
    coverage = (snapshot.get("comparability_metadata") or {}).get("metric_coverage") or {}
    if not coverage:
        return 0.0
    return round(sum(float(value or 0) for value in coverage.values()) / len(coverage), 4)


def compare_analysis_snapshots(
    baseline: Dict[str, Any],
    candidate: Dict[str, Any],
) -> Dict[str, Any]:
    """Operational comparability indicator for future tracking, not a scientific probability."""
    warnings: List[str] = []
    score = 100

    base_period = baseline.get("analysis_period") or {}
    candidate_period = candidate.get("analysis_period") or {}
    if base_period.get("kind") != candidate_period.get("kind"):
        score -= 15
        warnings.append("analysis_period_kind_changed")
    if base_period.get("days") != candidate_period.get("days"):
        score -= 25
        warnings.append("analysis_period_days_changed")

    base_profile = baseline.get("business_profile_digest") or {}
    candidate_profile = candidate.get("business_profile_digest") or {}
    for key in ["sector", "analysis_goal", "target_margin_pct", "low_margin_pct", "max_coverage_days"]:
        if base_profile.get(key) != candidate_profile.get(key):
            score -= 4
            warnings.append(f"business_profile_changed:{key}")

    base_roles = (baseline.get("comparability_metadata") or {}).get("source_roles") or {}
    candidate_roles = (candidate.get("comparability_metadata") or {}).get("source_roles") or {}
    if base_roles != candidate_roles:
        score -= 12
        warnings.append("source_roles_changed")

    base_fields = set((baseline.get("data_quality") or {}).get("mapped_fields") or [])
    candidate_fields = set((candidate.get("data_quality") or {}).get("mapped_fields") or [])
    if base_fields and candidate_fields:
        schema_overlap = len(base_fields & candidate_fields) / len(base_fields | candidate_fields)
        if schema_overlap < 0.75:
            score -= 18
            warnings.append("mapped_field_overlap_low")
    else:
        schema_overlap = 0.0
        score -= 10
        warnings.append("mapped_fields_missing")

    base_keys = _product_keys(baseline)
    candidate_keys = _product_keys(candidate)
    shared_products = len(base_keys & candidate_keys)
    max_catalog = max(len(base_keys), len(candidate_keys), 1)
    min_catalog = max(min(len(base_keys), len(candidate_keys)), 1)
    product_match_rate = round(shared_products / max_catalog, 4)
    retained_product_rate = round(shared_products / min_catalog, 4)

    if not base_keys or not candidate_keys:
        score -= 45
        warnings.append("product_identity_missing")
    elif product_match_rate < 0.3:
        score -= 40
        warnings.append("product_match_rate_critical")
    elif product_match_rate < 0.6:
        score -= 22
        warnings.append("product_match_rate_low")

    catalog_delta_rate = round(abs(len(base_keys) - len(candidate_keys)) / max_catalog, 4)
    if catalog_delta_rate > 0.5:
        score -= 20
        warnings.append("catalog_size_changed_strongly")
    elif catalog_delta_rate > 0.25:
        score -= 10
        warnings.append("catalog_size_changed")

    metric_coverage = round((_metric_coverage_score(baseline) + _metric_coverage_score(candidate)) / 2, 4)
    if metric_coverage < 0.5:
        score -= 20
        warnings.append("metric_coverage_low")
    elif metric_coverage < 0.75:
        score -= 10
        warnings.append("metric_coverage_partial")

    score = max(0, min(100, round(score)))
    if score >= 75:
        status = "COMPARABLE"
    elif score >= 45:
        status = "PARTIALLY_COMPARABLE"
    else:
        status = "NOT_COMPARABLE"

    return {
        "status": status,
        "score": score,
        "warnings": warnings,
        "shared_products": shared_products,
        "product_match_rate": product_match_rate,
        "retained_product_rate": retained_product_rate,
        "catalog_delta_rate": catalog_delta_rate,
        "metric_coverage": metric_coverage,
        "schema_overlap": round(schema_overlap, 4),
        "explanation": "Indicador operativo de comparabilidad entre snapshots; no es probabilidad estadistica.",
    }
