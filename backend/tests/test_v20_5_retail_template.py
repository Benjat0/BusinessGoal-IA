from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.retail_template import detect_retail_template_fit
from main import (
    _build_analysis_response,
    detect_columns,
    infer_file_type,
    normalize_dataframe,
    read_uploaded_file,
    validate_file,
)


class V205RetailTemplateTests(unittest.TestCase):
    def _fit(self, columns: list[str], df: pd.DataFrame | None = None, mapping: dict[str, str | None] | None = None):
        return detect_retail_template_fit(
            detected_columns=columns,
            column_mapping=mapping or {},
            normalized_df=df,
        )

    def test_high_fit_with_full_retail_columns(self):
        columns = [
            "sku",
            "product_name",
            "category",
            "supplier",
            "stock_units",
            "units_sold_90d",
            "unit_cost",
            "sale_price",
            "revenue_90d",
            "order_date",
        ]
        df = pd.DataFrame([{column: "x" for column in columns}])

        fit = self._fit(columns, df=df, mapping={column: column for column in columns})

        self.assertEqual(fit["fit_score"], 100)
        self.assertEqual(fit["confidence"], "HIGH")
        self.assertFalse(fit["missing_concepts"])

    def test_medium_fit_when_economic_columns_are_missing(self):
        fit = self._fit(["producto", "stock_actual", "ventas"])

        self.assertEqual(fit["fit_score"], 60)
        self.assertEqual(fit["confidence"], "MEDIUM")
        self.assertIn("coste/precio/margen", fit["missing_concepts"])

    def test_low_fit_with_barely_useful_columns(self):
        fit = self._fit(["notes", "description"])

        self.assertEqual(fit["fit_score"], 0)
        self.assertEqual(fit["confidence"], "LOW")

    def test_missing_concepts_are_explicit(self):
        fit = self._fit(["sku", "ventas"])

        self.assertIn("stock", fit["missing_concepts"])
        self.assertIn("coste/precio/margen", fit["missing_concepts"])
        self.assertIn("categoría/proveedor", fit["missing_concepts"])
        self.assertIn("fecha/periodo", fit["missing_concepts"])

    def test_recommended_files_follow_missing_concepts(self):
        fit = self._fit(["sku"])

        self.assertIn("Archivo de inventario actual", fit["recommended_files"])
        self.assertIn("Archivo de ventas recientes", fit["recommended_files"])
        self.assertIn("Archivo de catálogo con costes/precios", fit["recommended_files"])
        self.assertIn("Archivo de productos/categorías/proveedor", fit["recommended_files"])

    def test_business_questions_are_available(self):
        fit = self._fit(["sku", "stock", "ventas", "precio"])

        self.assertGreaterEqual(len(fit["business_questions_supported"]), 5)
        self.assertIn("¿Dónde tengo caja bloqueada en inventario?", fit["business_questions_supported"])

    def test_fit_is_strict_json_serializable(self):
        fit = self._fit(["sku", "stock", "ventas", "precio"])

        json.dumps(fit, allow_nan=False)

    def test_full_response_includes_retail_template_fit(self):
        df = pd.DataFrame([
            {
                "sku": "SKU-1",
                "product_name": "Camiseta",
                "category": "Textil",
                "supplier": "Proveedor A",
                "stock_units": 12,
                "unit_cost": 8,
                "sale_price": 20,
                "units_sold": 5,
                "revenue": 100,
                "last_sale_date": "2026-07-01",
            }
        ])
        columns = list(df.columns)
        response = _build_analysis_response(
            file_name="retail.csv",
            rows=1,
            columns=len(columns),
            detected_columns=columns,
            column_mapping={column: column for column in columns},
            mapping_confidence={column: 1.0 for column in columns},
            validation={"missing_required_fields": [], "quality_score": 100, "quality_label": "Alta"},
            normalized_df=df,
        )

        self.assertIn("retail_template_fit", response)
        self.assertEqual(response["retail_template_fit"]["template_key"], "retail_ecommerce")
        self.assertGreater(response["retail_template_fit"]["fit_score"], 0)
        json.dumps(response, allow_nan=False)

    def test_sparse_analysis_keeps_retail_fit_safe(self):
        df = pd.DataFrame([
            {
                "sku": "SKU-SPARSE",
                "product_name": "Producto sparse",
                "stock_units": 1,
                "unit_cost": None,
                "sale_price": None,
                "units_sold": None,
            }
        ])
        columns = list(df.columns)
        response = _build_analysis_response(
            file_name="sparse.csv",
            rows=1,
            columns=len(columns),
            detected_columns=columns,
            column_mapping={column: column for column in columns},
            mapping_confidence={column: 1.0 for column in columns},
            validation={"missing_required_fields": [], "quality_score": 70, "quality_label": "Media"},
            normalized_df=df,
        )

        self.assertIn("retail_template_fit", response)
        self.assertIn(response["retail_template_fit"]["confidence"], {"LOW", "MEDIUM", "HIGH"})
        json.dumps(response, allow_nan=False)

    def test_real_workbook_smoke_if_available(self):
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

        self.assertIn("retail_template_fit", response)
        self.assertGreater(response["retail_template_fit"]["fit_score"], 0)
        json.dumps(response, allow_nan=False)


if __name__ == "__main__":
    unittest.main()
