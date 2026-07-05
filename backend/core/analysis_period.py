from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

import pandas as pd

from .utils import normalize_text


DEFAULT_ASSUMED_WINDOW_DAYS = 90


def _period_hint_from_text(text: str) -> Optional[int]:
    normalized = normalize_text(text)
    patterns = [
        r"(?:ultimos|last|rolling|ventas|sales|sold|revenue)_(\d{1,3})(?:d|dias|days)?",
        r"(\d{1,3})(?:d|dias|days)",
    ]
    for pattern in patterns:
        match = re.search(pattern, normalized)
        if not match:
            continue
        days = int(match.group(1))
        if 1 <= days <= 366:
            return days
    return None


def _looks_like_transaction_date_source(source: Optional[str]) -> bool:
    if not source:
        return False
    normalized = normalize_text(str(source))
    if any(token in normalized for token in ["last", "ultima", "ultimo"]):
        return False
    transaction_tokens = [
        "fecha_venta",
        "sale_date",
        "sales_date",
        "order_date",
        "transaction_date",
        "fecha_pedido",
        "fecha_factura",
    ]
    return any(token in normalized for token in transaction_tokens)


def build_analysis_period(
    *,
    detected_columns: List[str],
    column_mapping: Dict[str, Optional[str]],
    normalized_df: pd.DataFrame,
) -> Dict[str, Any]:
    """Describe the time basis for sales-like metrics without inventing dates."""
    sales_sources = [
        column_mapping.get("units_sold"),
        column_mapping.get("revenue"),
    ]
    for source in sales_sources:
        if not source:
            continue
        days = _period_hint_from_text(str(source))
        if days:
            return {
                "kind": "ASSUMED_WINDOW",
                "start_date": None,
                "end_date": None,
                "days": days,
                "label": f"Ventana inferida por columna: {days} dias",
                "confidence": 0.62,
                "source": "COLUMN_SEMANTIC_HINT",
                "evidence": [str(source)],
            }

    date_source = column_mapping.get("last_sale_date")
    if _looks_like_transaction_date_source(date_source) and "last_sale_date" in normalized_df.columns:
        parsed = pd.to_datetime(normalized_df["last_sale_date"], errors="coerce")
        valid_dates = parsed.dropna()
        unique_dates = valid_dates.dt.date.drop_duplicates()
        if len(unique_dates) >= 2:
            start_date = valid_dates.min().date().isoformat()
            end_date = valid_dates.max().date().isoformat()
            days = (valid_dates.max().date() - valid_dates.min().date()).days + 1
            return {
                "kind": "DETECTED_DATE_RANGE",
                "start_date": start_date,
                "end_date": end_date,
                "days": days,
                "label": f"Rango detectado en datos de ventas: {start_date} a {end_date}",
                "confidence": 0.78,
                "source": "TRANSACTION_DATE_RANGE",
                "evidence": [str(date_source), f"unique_dates={len(unique_dates)}"],
            }

    # A last_sale_date column is useful evidence, but it is not a transaction log
    # and cannot prove the period covered by units_sold/revenue.
    date_evidence: List[str] = []
    if "last_sale_date" in normalized_df.columns:
        parsed = pd.to_datetime(normalized_df["last_sale_date"], errors="coerce")
        valid_dates = parsed.dropna()
        if not valid_dates.empty:
            date_evidence = [
                "last_sale_date_present",
                f"min_last_sale_date={valid_dates.min().date().isoformat()}",
                f"max_last_sale_date={valid_dates.max().date().isoformat()}",
            ]

    detected_text = " ".join(str(column) for column in detected_columns)
    detected_days = _period_hint_from_text(detected_text)
    if detected_days:
        return {
            "kind": "ASSUMED_WINDOW",
            "start_date": None,
            "end_date": None,
            "days": detected_days,
            "label": f"Ventana inferida por nombres de columnas: {detected_days} dias",
            "confidence": 0.5,
            "source": "DETECTED_COLUMN_SEMANTICS",
            "evidence": [f"detected_days={detected_days}", *date_evidence],
        }

    return {
        "kind": "ASSUMED_WINDOW",
        "start_date": None,
        "end_date": None,
        "days": DEFAULT_ASSUMED_WINDOW_DAYS,
        "label": "Ventana asumida por el motor MVP: 90 dias",
        "confidence": 0.35,
        "source": "ENGINE_DEFAULT_UNITS_SOLD_WINDOW",
        "evidence": date_evidence,
    }
