from __future__ import annotations

import re
from typing import Any

import pandas as pd


def normalize_text(value: Any) -> str:
    """Normalize text for safe matching."""
    if value is None:
        return ""
    text = str(value).strip().lower()
    replacements = {
        "á": "a",
        "é": "e",
        "í": "i",
        "ó": "o",
        "ú": "u",
        "ü": "u",
        "ñ": "n",
        "ç": "c",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def parse_business_number(value: Any) -> float:
    """
    Convert spreadsheet-like numeric values to floats safely.

    Handles common Spanish/European and US formats:
    - 119.75 -> 119.75
    - 119,75 -> 119.75
    - 1.199,75 -> 1199.75
    - 1,199.75 -> 1199.75
    - € 1.199,75 -> 1199.75

    The previous MVP version removed every dot before checking decimal
    separators, so values such as 119.75 became 11975. This function avoids
    that issue by detecting which separator is probably decimal.
    """
    if value is None:
        return 0.0

    # Native numeric values from Excel should be preserved.
    if isinstance(value, (int, float)) and not pd.isna(value):
        return float(value)

    text = str(value).strip()
    if text == "" or text.lower() in {"nan", "none", "null"}:
        return 0.0

    # Remove currency symbols, percentages and spaces, but keep separators.
    text = (
        text.replace("€", "")
        .replace("$", "")
        .replace("%", "")
        .replace(" ", "")
        .replace("\u00a0", "")
    )
    text = re.sub(r"[^0-9,\.\-]", "", text)

    if text in {"", "-", ".", ","}:
        return 0.0

    has_comma = "," in text
    has_dot = "." in text

    if has_comma and has_dot:
        # The last separator is usually the decimal separator.
        if text.rfind(",") > text.rfind("."):
            # European format: 1.234,56
            text = text.replace(".", "").replace(",", ".")
        else:
            # US/UK format: 1,234.56
            text = text.replace(",", "")
    elif has_comma:
        # Spanish decimal: 119,75. If comma is likely thousands, remove it.
        if re.match(r"^-?\d+,\d{1,2}$", text):
            text = text.replace(",", ".")
        else:
            text = text.replace(",", "")
    elif has_dot:
        # Decimal dot: 119.75. If dot is likely thousands, remove it.
        if re.match(r"^-?\d+\.\d{1,2}$", text):
            pass
        else:
            text = text.replace(".", "")

    try:
        return float(text)
    except ValueError:
        return 0.0


def to_number(series: pd.Series) -> pd.Series:
    """Convert spreadsheet-like numeric text to floats safely."""
    if series is None:
        return pd.Series(dtype="float64")

    return series.apply(parse_business_number).astype(float).fillna(0)


def safe_divide(numerator: float, denominator: float) -> float:
    if denominator in (0, None):
        return 0.0
    try:
        return float(numerator) / float(denominator)
    except Exception:
        return 0.0
