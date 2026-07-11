from __future__ import annotations

from typing import Any, Dict, List, Tuple

import pandas as pd

from .utils import normalize_text


def _present(value: Any) -> bool:
    return value is not None and pd.notna(value) and str(value).strip() not in {"", "None"}


def build_product_ref(row: pd.Series) -> Dict[str, Any]:
    """Build the canonical product identity used by snapshots and decisions."""
    sku = row.get("sku")
    name = row.get("product_name")
    normalized_name = normalize_text(name)

    if _present(sku):
        return {
            "identity_key": f"sku:{normalize_text(sku)}",
            "identity_type": "SKU",
            "identity_confidence": 0.96,
            "sku": str(sku),
            "name": str(name) if _present(name) else None,
            "warnings": [],
        }

    return {
        "identity_key": f"name:{normalized_name}",
        "identity_type": "NORMALIZED_NAME",
        "identity_confidence": 0.62 if normalized_name else 0.2,
        "sku": None,
        "name": str(name) if _present(name) else None,
        "warnings": ["product_identity_uses_normalized_name"],
    }


def _matching_rows(enriched: pd.DataFrame, column: str, normalized_value: str) -> List[pd.Series]:
    if not normalized_value or column not in enriched.columns:
        return []

    matches: List[pd.Series] = []
    for _, row in enriched.iterrows():
        value = row.get(column)
        if _present(value) and normalize_text(value) == normalized_value:
            matches.append(row)
    return matches


def _with_warning(ref: Dict[str, Any], warning: str, confidence: float | None = None) -> Dict[str, Any]:
    next_ref = dict(ref)
    warnings = list(next_ref.get("warnings") or [])
    if warning not in warnings:
        warnings.append(warning)
    next_ref["warnings"] = warnings
    if confidence is not None:
        next_ref["identity_confidence"] = min(float(next_ref.get("identity_confidence", confidence) or confidence), confidence)
    return next_ref


def resolve_product_ref(product_value: Any, enriched: pd.DataFrame) -> Tuple[Dict[str, Any], str]:
    """Resolve recommendation evidence back to enriched product identity.

    Resolution is conservative: SKU is primary when present, product name is the
    fallback, and unresolved values remain NORMALIZED_NAME with warnings.
    """
    product_name = str(product_value).strip() if _present(product_value) else ""
    normalized_value = normalize_text(product_name)

    sku_matches = _matching_rows(enriched, "sku", normalized_value)
    if sku_matches:
        ref = build_product_ref(sku_matches[0])
        if len(sku_matches) > 1:
            ref = _with_warning(ref, "product_identity_duplicate_sku_match", 0.72)
        return ref, product_name

    name_matches = _matching_rows(enriched, "product_name", normalized_value)
    if name_matches:
        ref = build_product_ref(name_matches[0])
        if len(name_matches) > 1:
            ref = _with_warning(ref, "product_identity_duplicate_name_match", 0.55)
        return ref, product_name

    return {
        "identity_key": f"name:{normalized_value}",
        "identity_type": "NORMALIZED_NAME",
        "identity_confidence": 0.35 if normalized_value else 0.2,
        "sku": None,
        "name": product_name or None,
        "warnings": ["product_identity_unresolved"],
    }, product_name
