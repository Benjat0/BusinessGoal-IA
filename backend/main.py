from __future__ import annotations

import io
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from core.analysis_period import build_analysis_period
from core.analysis_comparison import build_analysis_comparison
from core.analysis_snapshot import build_analysis_snapshot
from core.business_profile import business_profile_options, parse_business_profile
from core.economic_value import build_economic_value_summary
from core.field_mapper import CANONICAL_FIELDS, detect_columns, normalize_dataframe
from core.file_validator import FIELD_DESCRIPTIONS, FIELD_LABELS, FIELD_OPTIONS, build_reverse_mapping, infer_file_type, validate_file
from core.kpi_engine import calculate_metric_coverage, calculate_summary_kpis, enrich_product_metrics, product_records
from core.multi_file_engine import merge_prepared_files, prepare_business_file
from core.scenario_engine import build_scenario_simulation
from core.recommendation_engine import (
    build_action_plan,
    build_consolidated_recommendations,
    build_executive_briefing,
    build_opportunity_groups,
    build_recommendations,
    build_today_actions,
    build_trust_layer,
)

app = FastAPI(
    title="BusinessGoal IA",
    description="Copiloto de decisiones empresariales para negocios con stock, ventas e inventario.",
    version="0.5.0-multi-file-analysis",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> Dict[str, str]:
    return {
        "status": "ok",
        "message": "BusinessGoal backend is running",
    }


@app.post("/compare-analysis-snapshots")
def compare_analysis_snapshots_endpoint(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="El cuerpo de la petición debe ser un objeto JSON.")

    try:
        return build_analysis_comparison(
            baseline_snapshot=payload.get("baseline_snapshot"),
            candidate_snapshot=payload.get("candidate_snapshot"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def read_uploaded_file(file_name: str, content: bytes) -> pd.DataFrame:
    lower_name = file_name.lower()

    try:
        if lower_name.endswith(".csv"):
            try:
                return pd.read_csv(io.BytesIO(content))
            except UnicodeDecodeError:
                return pd.read_csv(io.BytesIO(content), encoding="latin-1")

        if lower_name.endswith(".xlsx") or lower_name.endswith(".xls"):
            return pd.read_excel(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"No se pudo leer el archivo: {exc}") from exc

    raise HTTPException(status_code=400, detail="Formato no soportado. Sube CSV, XLSX o XLS.")


def _sum_impact(recommendations: List[Dict[str, Any]], *, category: str | None = None, rec_type: str | None = None) -> float:
    total = 0.0
    for rec in recommendations:
        if category and rec.get("category") != category:
            continue
        if rec_type and rec.get("type") != rec_type:
            continue
        total += float(rec.get("economic_impact", 0) or 0)
    return round(total, 2)


def _coverage_sufficient(metric_coverage: Optional[Dict[str, float]], key: str, minimum: float = 0.5) -> bool:
    if metric_coverage is None:
        return True
    value = metric_coverage.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return float(value) >= minimum


def _build_business_status(
    summary: Dict[str, Any],
    recommendations: List[Dict[str, Any]],
    metric_coverage: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    # v20 economic classes are not additive; status is based on independent
    # operational signals, never on the heterogeneous legacy impact sum.
    high_priority = sum(1 for rec in recommendations if rec.get("priority") == "high")
    stockout_risks = sum(1 for rec in recommendations if rec.get("type") == "stockout_risk")
    dead_stock = sum(1 for rec in recommendations if rec.get("type") == "dead_stock")
    excess_stock = sum(1 for rec in recommendations if rec.get("type") == "excess_stock")
    low_margin = sum(1 for rec in recommendations if rec.get("type") == "low_margin_high_sales")
    cash_release = float(summary.get("cash_release_potential", 0) or 0)
    inventory_value = float(summary.get("total_inventory_value", 0) or 0)
    inventory_coverage_sufficient = _coverage_sufficient(metric_coverage, "inventory_value")
    capital_pressure = (cash_release / inventory_value) if inventory_coverage_sufficient and inventory_value > 0 else None
    recommendation_count = len(recommendations)
    high_capital_pressure = capital_pressure is not None and capital_pressure >= 0.6
    medium_capital_pressure = capital_pressure is not None and capital_pressure >= 0.25

    if high_priority >= 5 or high_capital_pressure or (stockout_risks >= 3 and high_priority >= 2):
        status = "Atención prioritaria"
        tone = "warning"
        if high_capital_pressure:
            message = "El análisis activo muestra una presión relevante de capital en inventario. Conviene priorizar las decisiones asociadas a stock y rotación."
        elif stockout_risks >= 3:
            message = "Se observan riesgos operativos asociados a disponibilidad en productos con demanda."
        else:
            message = "El análisis activo concentra varias señales económicas y operativas que requieren priorización."
    elif high_priority > 0 or medium_capital_pressure or recommendation_count > 0:
        status = "Mejora disponible"
        tone = "info"
        if low_margin > 0:
            message = "Existen oportunidades de revisión de margen en productos con actividad comercial."
        elif stockout_risks > 0:
            message = "Se observan señales de disponibilidad que conviene revisar antes de tomar decisiones operativas."
        elif dead_stock > 0 or excess_stock > 0 or medium_capital_pressure:
            message = "El análisis activo identifica presión de inventario y rotación que puede revisarse de forma priorizada."
        else:
            message = "El análisis activo muestra oportunidades de mejora que conviene revisar por prioridad."
    else:
        status = "Situación controlada"
        tone = "positive"
        message = "No se observan alertas económicas u operativas relevantes con los datos analizados."

    return {
        "status": status,
        "tone": tone,
        "message": message,
        "signals": {
            "high_priority_count": high_priority,
            "capital_pressure_pct": round(capital_pressure * 100, 2) if capital_pressure is not None else None,
            "stockout_risk_count": stockout_risks,
            "dead_stock_count": dead_stock,
            "excess_stock_count": excess_stock,
            "low_margin_high_sales_count": low_margin,
            "recommendation_count": recommendation_count,
        },
    }


def _calculate_business_score(
    summary: Dict[str, Any],
    recommendations: List[Dict[str, Any]],
    metric_coverage: Optional[Dict[str, float]] = None,
) -> Dict[str, int]:
    high_priority = sum(1 for rec in recommendations if rec.get("priority") == "high")
    risks = sum(1 for rec in recommendations if rec.get("type") == "stockout_risk")
    dead_stock = sum(1 for rec in recommendations if rec.get("type") == "dead_stock")
    excess_stock = sum(1 for rec in recommendations if rec.get("type") == "excess_stock")
    low_margin = sum(1 for rec in recommendations if rec.get("type") == "low_margin_high_sales")

    margin = float(summary.get("average_margin_pct", 0) or 0)
    inventory_value = float(summary.get("total_inventory_value", 0) or 0)
    cash_release = float(summary.get("cash_release_potential", 0) or 0)
    inventory_coverage_sufficient = _coverage_sufficient(metric_coverage, "inventory_value")
    margin_coverage_sufficient = (
        _coverage_sufficient(metric_coverage, "gross_profit_estimated")
        and _coverage_sufficient(metric_coverage, "revenue")
    )
    immobilized_pressure = (cash_release / inventory_value * 100) if inventory_coverage_sufficient and inventory_value else 0

    # The score is an executive communication indicator, not an accounting metric.
    # It intentionally penalizes risks and capital pressure without making the UI feel punitive.
    score = 92
    score -= min(12, high_priority * 1.5)
    score -= min(8, risks * 2)
    score -= min(6, dead_stock * 1.5)
    score -= min(6, excess_stock * 1)
    score -= min(4, low_margin * 1)
    score -= min(10, immobilized_pressure / 12)

    if margin_coverage_sufficient:
        if margin >= 45:
            score += 4
        elif margin < 20:
            score -= 6

    current = int(max(45, min(98, round(score))))
    after_actions = int(max(current, min(100, current + 8 + min(8, len(recommendations)))))
    return {
        "business_score_current": current,
        "business_score_after_actions": after_actions,
    }


def _validate_basic_upload(file: UploadFile) -> None:
    if not file.filename:
        raise HTTPException(status_code=400, detail="El archivo no tiene nombre.")

    lower_name = file.filename.lower()
    if not (lower_name.endswith(".csv") or lower_name.endswith(".xlsx") or lower_name.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Formato no soportado. Sube CSV, XLSX o XLS.")


def _preview_rows(df: pd.DataFrame, limit: int = 6) -> List[Dict[str, Any]]:
    safe_df = df.head(limit).copy().fillna("")
    return safe_df.astype(str).to_dict(orient="records")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _parse_mapping_override(mapping_json: Optional[str], default_mapping: Dict[str, Optional[str]]) -> Dict[str, Optional[str]]:
    if not mapping_json:
        return default_mapping

    try:
        parsed = json.loads(mapping_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="El mapeo de columnas no tiene formato JSON válido.") from exc

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="El mapeo de columnas debe ser un objeto JSON.")

    clean_mapping: Dict[str, Optional[str]] = {}
    for field in CANONICAL_FIELDS.keys():
        value = parsed.get(field)
        clean_mapping[field] = str(value) if value not in (None, "", "ignore") else None
    return clean_mapping



def _build_analysis_response(
    *,
    file_name: str,
    rows: int,
    columns: int,
    detected_columns: List[str],
    column_mapping: Dict[str, Optional[str]],
    mapping_confidence: Dict[str, float],
    validation: Dict[str, Any],
    normalized_df: pd.DataFrame,
    merge_summary: Optional[Dict[str, Any]] = None,
    business_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Shared Decision Engine pipeline for single-file and multi-file analysis."""
    analysis_id = str(uuid.uuid4())
    analysis_created_at = _utc_now_iso()
    profile = business_profile or parse_business_profile()
    enriched = enrich_product_metrics(normalized_df)
    metric_coverage = calculate_metric_coverage(enriched)
    analysis_period = build_analysis_period(
        detected_columns=detected_columns,
        column_mapping=column_mapping,
        normalized_df=normalized_df,
    )

    summary = calculate_summary_kpis(enriched)
    recommendations = build_recommendations(enriched, business_profile=profile)
    consolidated_recommendations = build_consolidated_recommendations(recommendations)
    action_plan = build_action_plan(consolidated_recommendations)
    opportunity_groups = build_opportunity_groups(recommendations)
    today_actions = build_today_actions(consolidated_recommendations)

    cash_release = _sum_impact(recommendations, category="cash_release")
    sales_protection = _sum_impact(recommendations, category="sales_protection")
    margin_improvement = _sum_impact(recommendations, category="margin_improvement")
    total_impact = _sum_impact(recommendations)
    risks_detected = sum(1 for rec in recommendations if rec.get("type") == "stockout_risk")
    opportunities_detected = len(recommendations) - risks_detected
    inventory_value = float(summary.get("total_inventory_value", 0) or 0)

    summary.update({
        "potential_recoverable_benefit": round(total_impact, 2),
        "cash_release_potential": cash_release,
        "capital_immobilized_reducible": cash_release,
        "sales_protection_potential": sales_protection,
        "margin_improvement_potential": margin_improvement,
        "estimated_economic_leakage": round((cash_release * 0.08) + margin_improvement + sales_protection, 2),
        "risks_detected": risks_detected,
        "opportunities_detected": opportunities_detected,
        "immobilized_capital_pct": round((cash_release / inventory_value * 100) if inventory_value else 0, 2),
        "estimated_profit_after_actions": round(float(summary.get("total_gross_profit_estimated", 0) or 0) + margin_improvement + sales_protection, 2),
    })
    summary.update(_calculate_business_score(summary, recommendations, metric_coverage=metric_coverage))

    executive_summary = build_executive_briefing(summary, consolidated_recommendations, opportunity_groups)
    executive_summary["business_context"] = f"Perfil aplicado: {profile.get('sector_label')} · Objetivo: {profile.get('analysis_goal_label')} · Margen objetivo: {profile.get('target_margin_pct')}%."

    if merge_summary:
        files_count = merge_summary.get("files_count", 0)
        matched = merge_summary.get("matched_sales_products", 0)
        if files_count > 1:
            executive_summary["data_context"] = f"Análisis construido cruzando {files_count} archivos. Ventas emparejadas con {matched} productos."

    impact_breakdown = {
        "cash_release": cash_release,
        "capital_immobilized_reducible": cash_release,
        "estimated_loss_or_risk": round((cash_release * 0.08) + margin_improvement + sales_protection, 2),
        "margin_improvement": margin_improvement,
        "sales_protection": sales_protection,
        "total_impact": total_impact,
        "is_additive": False,
        "explanation": (
            "El valor económico identificado combina categorías heterogéneas: caja liberable, "
            "margen mejorable y margen bruto expuesto. No es beneficio contable agregado ni impacto neto. "
            "La caja liberable no debe interpretarse como beneficio, sino como liquidez potencial."
        ),
    }
    economic_value_summary = build_economic_value_summary(
        recommendations=recommendations,
        analysis_period=analysis_period,
    )
    scenario_simulation = build_scenario_simulation(summary, recommendations, profile)
    analysis_snapshot = build_analysis_snapshot(
        analysis_id=analysis_id,
        analysis_created_at=analysis_created_at,
        analysis_period=analysis_period,
        business_profile=profile,
        summary=summary,
        economic_value_summary=economic_value_summary,
        enriched=enriched,
        recommendations=recommendations,
        column_mapping=column_mapping,
        mapping_confidence=mapping_confidence,
        validation=validation,
        merge_summary=merge_summary,
        metric_coverage=metric_coverage,
    )

    response = {
        "analysis_id": analysis_id,
        "analysis_created_at": analysis_created_at,
        "analysis_period": analysis_period,
        "file_name": file_name,
        "rows": int(rows),
        "columns": int(columns),
        "detected_columns": detected_columns,
        "column_mapping": column_mapping,
        "column_to_field_mapping": build_reverse_mapping(column_mapping),
        "mapping_confidence": mapping_confidence,
        "missing_required_fields": validation.get("missing_required_fields", []),
        "file_validation": validation,
        "summary_kpis": summary,
        "business_status": _build_business_status(summary, recommendations, metric_coverage=metric_coverage),
        "business_profile": profile,
        "executive_summary": executive_summary,
        "impact_breakdown": impact_breakdown,
        "economic_value_summary": economic_value_summary,
        "analysis_snapshot": analysis_snapshot,
        "trust_layer": build_trust_layer(summary, recommendations, consolidated_recommendations),
        "scenario_simulation": scenario_simulation,
        "recommendations": recommendations,
        "consolidated_recommendations": consolidated_recommendations,
        "opportunity_groups": opportunity_groups,
        "today_actions": today_actions,
        "action_plan": action_plan,
        "products_preview": product_records(enriched, limit=100),
        "status": "completed",
    }
    executive_summary["business_context"] = f"Perfil aplicado: {profile.get('sector_label')} · Objetivo: {profile.get('analysis_goal_label')} · Margen objetivo: {profile.get('target_margin_pct')}%."

    if merge_summary:
        response["merge_summary"] = merge_summary
        response["analysis_mode"] = "multi_file" if merge_summary.get("files_count", 0) > 1 else "single_file"
    else:
        response["analysis_mode"] = "single_file"
    return response


@app.post("/inspect")
async def inspect_file(file: UploadFile = File(...), file_type: Optional[str] = Form(None)) -> Dict[str, Any]:
    _validate_basic_upload(file)
    content = await file.read()
    df = read_uploaded_file(file.filename or "archivo", content)

    if df.empty:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    mapping_result = detect_columns(df)
    suggested_type = file_type or infer_file_type(mapping_result.mapping)
    validation = validate_file(df, mapping_result.mapping, mapping_result.confidence, suggested_type)

    return {
        "file_name": file.filename,
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "detected_columns": mapping_result.detected_columns,
        "column_mapping": mapping_result.mapping,
        "column_to_field_mapping": build_reverse_mapping(mapping_result.mapping),
        "mapping_confidence": mapping_result.confidence,
        "field_labels": FIELD_LABELS,
        "field_descriptions": FIELD_DESCRIPTIONS,
        "field_options": FIELD_OPTIONS,
        "preview_rows": _preview_rows(df),
        "validation": validation,
        "business_profile_options": business_profile_options(),
        "status": "inspection_ready",
    }


@app.post("/analyze")
async def analyze_file(
    file: UploadFile = File(...),
    mapping_json: Optional[str] = Form(None),
    file_type: Optional[str] = Form(None),
    business_profile_json: Optional[str] = Form(None),
) -> Dict[str, Any]:
    _validate_basic_upload(file)

    content = await file.read()
    df = read_uploaded_file(file.filename or "archivo", content)

    if df.empty:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    mapping_result = detect_columns(df)
    final_mapping = _parse_mapping_override(mapping_json, mapping_result.mapping)
    validation = validate_file(df, final_mapping, mapping_result.confidence, file_type or infer_file_type(final_mapping))

    if not validation["can_analyze"]:
        missing = ", ".join(FIELD_LABELS.get(field, field) for field in validation["missing_required_fields"])
        raise HTTPException(status_code=400, detail=f"No se puede analizar todavía. Faltan campos obligatorios: {missing}.")

    profile = parse_business_profile(business_profile_json)
    normalized = normalize_dataframe(df, final_mapping)
    return _build_analysis_response(
        file_name=file.filename or "archivo",
        rows=int(df.shape[0]),
        columns=int(df.shape[1]),
        detected_columns=mapping_result.detected_columns,
        column_mapping=final_mapping,
        mapping_confidence=mapping_result.confidence,
        validation=validation,
        normalized_df=normalized,
        business_profile=profile,
    )


def _safe_parse_mapping(mapping_json: Optional[str]) -> Optional[Dict[str, Optional[str]]]:
    if not mapping_json:
        return None
    try:
        parsed = json.loads(mapping_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Uno de los mapeos no tiene formato JSON válido.") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="El mapeo debe ser un objeto JSON.")
    return {field: (str(value) if value not in (None, "", "ignore") else None) for field, value in parsed.items()}


async def _prepare_optional_upload(
    *,
    role: str,
    upload: Optional[UploadFile],
    mapping_json: Optional[str] = None,
):
    if upload is None:
        return None
    _validate_basic_upload(upload)
    content = await upload.read()
    df = read_uploaded_file(upload.filename or "archivo", content)
    if df.empty:
        raise HTTPException(status_code=400, detail=f"El archivo {upload.filename} está vacío.")
    return prepare_business_file(
        role=role,
        file_name=upload.filename or role,
        df=df,
        mapping_override=_safe_parse_mapping(mapping_json),
    )


@app.post("/inspect-batch")
async def inspect_batch(
    combined_file: Optional[UploadFile] = File(None),
    inventory_file: Optional[UploadFile] = File(None),
    sales_file: Optional[UploadFile] = File(None),
) -> Dict[str, Any]:
    prepared = []
    for item in [
        await _prepare_optional_upload(role="combined", upload=combined_file),
        await _prepare_optional_upload(role="inventory", upload=inventory_file),
        await _prepare_optional_upload(role="sales", upload=sales_file),
    ]:
        if item is not None:
            prepared.append(item)

    if not prepared:
        raise HTTPException(status_code=400, detail="Sube al menos un archivo para inspeccionar.")

    try:
        merged_df, merge_summary = merge_prepared_files(prepared)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    analysis_ready = any(file.validation.get("can_analyze") for file in prepared)
    if len(prepared) > 1:
        # Multi-file can continue when there is an inventory/combined base plus optional sales.
        has_base = any(file.role in {"combined", "inventory"} and file.validation.get("can_analyze") for file in prepared)
        analysis_ready = has_base

    return {
        "business_profile_options": business_profile_options(),
        "status": "batch_inspection_ready",
        "analysis_ready": analysis_ready,
        "rows_after_merge": int(merged_df.shape[0]),
        "columns_after_merge": int(merged_df.shape[1]),
        "merge_summary": merge_summary,
        "preview_rows": _preview_rows(merged_df, limit=6),
        "field_labels": FIELD_LABELS,
        "field_descriptions": FIELD_DESCRIPTIONS,
        "field_options": FIELD_OPTIONS,
    }


@app.post("/analyze-batch")
async def analyze_batch(
    combined_file: Optional[UploadFile] = File(None),
    inventory_file: Optional[UploadFile] = File(None),
    sales_file: Optional[UploadFile] = File(None),
    combined_mapping_json: Optional[str] = Form(None),
    inventory_mapping_json: Optional[str] = Form(None),
    sales_mapping_json: Optional[str] = Form(None),
    business_profile_json: Optional[str] = Form(None),
) -> Dict[str, Any]:
    profile = parse_business_profile(business_profile_json)

    prepared = []
    for item in [
        await _prepare_optional_upload(role="combined", upload=combined_file, mapping_json=combined_mapping_json),
        await _prepare_optional_upload(role="inventory", upload=inventory_file, mapping_json=inventory_mapping_json),
        await _prepare_optional_upload(role="sales", upload=sales_file, mapping_json=sales_mapping_json),
    ]:
        if item is not None:
            prepared.append(item)

    if not prepared:
        raise HTTPException(status_code=400, detail="Sube al menos un archivo para analizar.")

    has_base = any(file.role in {"combined", "inventory"} and file.validation.get("can_analyze") for file in prepared)
    if not has_base:
        raise HTTPException(
            status_code=400,
            detail="Para un análisis económico completo necesitas un archivo combinado o un archivo de inventario. El archivo de ventas por sí solo no permite calcular stock, capital inmovilizado ni margen.",
        )

    merged_df, merge_summary = merge_prepared_files(prepared)

    if merged_df.empty:
        raise HTTPException(status_code=400, detail="No se pudieron combinar productos entre los archivos subidos.")

    merged_validation = {
        "file_type": "multi_file",
        "file_type_label": "Análisis multiarchivo",
        "quality_score": merge_summary.get("merge_quality_score", 0),
        "quality_label": "Alta" if merge_summary.get("merge_quality_score", 0) >= 85 else "Media" if merge_summary.get("merge_quality_score", 0) >= 65 else "Baja",
        "quality_tone": "positive" if merge_summary.get("merge_quality_score", 0) >= 85 else "warning" if merge_summary.get("merge_quality_score", 0) >= 65 else "critical",
        "required_fields": ["product_name", "stock_units"],
        "recommended_fields": ["sku", "unit_cost", "sale_price", "units_sold", "revenue"],
        "missing_required_fields": [],
        "missing_recommended_fields": [],
        "issues": [
            {"severity": "info", "title": "Archivos cruzados", "message": note}
            for note in merge_summary.get("merge_notes", [])
        ],
        "positives": [
            f"Se han usado {merge_summary.get('files_count', 0)} archivos para construir el análisis.",
            f"Estrategia de unión: {merge_summary.get('join_strategy')}",
        ],
        "can_analyze": True,
    }

    detected_columns = []
    combined_mapping: Dict[str, Optional[str]] = {}
    combined_confidence: Dict[str, float] = {}
    for file in prepared:
        detected_columns.extend([f"{file.role}:{column}" for column in file.detected_columns])
        for field, source in file.mapping.items():
            if source and field not in combined_mapping:
                combined_mapping[field] = f"{file.role}:{source}"
                combined_confidence[field] = file.confidence.get(field, 0)
    for field in CANONICAL_FIELDS.keys():
        combined_mapping.setdefault(field, None)
        combined_confidence.setdefault(field, 0)

    response = _build_analysis_response(
        file_name=" + ".join(file.file_name for file in prepared),
        rows=int(merged_df.shape[0]),
        columns=int(merged_df.shape[1]),
        detected_columns=detected_columns,
        column_mapping=combined_mapping,
        mapping_confidence=combined_confidence,
        validation=merged_validation,
        normalized_df=merged_df,
        merge_summary=merge_summary,
        business_profile=profile,
    )
    return response
