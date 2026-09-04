# BusinessGoal v21.1 — Sellable Decision Cockpit

## Objetivo

Convertir la evolución v20/v21 en una demostración comercial coherente para pymes de retail, e-commerce, distribución, almacenes y recambios que trabajan con Excel o CSV.

## Propuesta de valor

BusinessGoal es una plataforma de control de negocio que convierte datos operativos en decisiones priorizadas sobre caja, margen, inventario y ventas.

La interfaz y los contratos deben usar lenguaje prudente: señal detectada, impacto estimado, riesgo de no actuar, supuestos y recomendación para revisar. No se afirma causalidad ni se promete un resultado.

## Flujo validable

```text
carga manual → validación y cobertura → dashboard → decisión →
escenarios → impacto estimado → riesgo → supuestos → registro → historial
```

## Cambios de esta versión

- El dashboard sustituye el antiguo Business Score por Data Readiness.
- El primer nivel muestra ventas, margen bruto, valor de inventario, baja rotación, riesgo de rotura y decisiones urgentes.
- La navegación se reduce a Dashboard, Decisiones, Scenario Lab, Ventas, Inventario, Productos, Archivos y calidad, Historial y Configuración.
- El contrato de decisión incorpora `problem_type`, `risk_of_inaction` y `assumptions`.
- El registro local conserva `selected_scenario`, responsable, motivo, impacto esperado, notas y próxima fecha de revisión.
- El historial separa decisiones registradas de análisis guardados.
- La superficie principal pasa a fondo mineral claro con sidebar Graphite oscuro, manteniendo la identidad del producto.

## Archivos afectados

- `backend/core/decision_engine.py`
- `backend/tests/test_v20_3_decision_center.py`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/decision-center.ts`
- `frontend/src/features/home/decision-cockpit.tsx`
- `frontend/src/features/decisions/decision-center.tsx`
- `frontend/src/components/layout/navigation.ts`
- `frontend/src/components/layout/sidebar.tsx`
- `frontend/src/components/ui/card.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/globals.css`

## Fuera de alcance

- APIs y conectores externos.
- OpenAI API o recomendaciones generativas.
- Autenticación, pagos, multiempresa o base de datos productiva.
- Tracking causal automático.
- Predicción, machine learning u optimización matemática.

## Criterio de salida

- Los contratos v20 continúan siendo compatibles.
- Cada decisión explica evidencia, impacto estimado, riesgo y supuestos.
- Se puede seleccionar un escenario y registrar la decisión sin cambiar el lifecycle existente.
- El historial refleja la selección y la información operativa.
- Los análisis parciales no muestran una puntuación global de salud.
- Backend, TypeScript y build de producción pasan.
