# BusinessGoal IA

BusinessGoal IA es una aplicación B2B de inteligencia de decisiones para empresas con catálogo, ventas, stock, costes y precios. Convierte CSV/XLS/XLSX en una lectura auditable: qué datos son utilizables, qué áreas pueden evaluarse, qué señales económicas se detectan y qué decisión conviene revisar.

## Estado del producto

La rama `main` contiene el MVP demo y la evolución v20 del Decision Center:

- carga, inspección y mapeo de CSV/XLS/XLSX;
- análisis simple y multiarchivo de inventario, ventas y catálogo;
- cálculo determinista de métricas y cobertura de datos;
- decisiones canónicas con evidencia, prioridad, hipótesis y ciclo de vida local;
- árbol de impulsores económicos;
- escenarios conservador, recomendado e intensivo por decisión;
- plantilla de encaje Retail / ecommerce;
- informe ejecutivo y exportaciones.

La rama `codex/v21-0-audit-core-data-readiness` añade Audit Core v21.0: separa la calidad de datos de la salud empresarial y muestra de forma explícita qué áreas son o no evaluables.

## Principio de producto

BusinessGoal no es un dashboard genérico ni un chatbot empresarial.

Su flujo es:

```text
datos → cobertura y evidencia → diagnóstico → decisión priorizada →
acción aprobada → medición posterior
```

Las cifras económicas se presentan con su semántica: caja liberable, margen mejorable o margen expuesto. No se suman como si fueran un beneficio garantizado.

## Alcance actual

El motor actual está validado para retail, e-commerce, distribución y negocios con catálogo. La expansión multisector se hará mediante un Audit Core común y plantillas específicas de datos y reglas, no interpretando cualquier documento sin límites.

Consulta [Audit Core v21.0](docs/product/v21-audit-core-data-readiness.md) para el alcance, contrato y exclusiones de la fase.

## Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS.
- Backend: FastAPI, Python, pandas, openpyxl, xlrd y pydantic.

## Ejecución local

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend: `http://127.0.0.1:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:3000`

## Endpoints

```text
GET  /health
POST /inspect
POST /analyze
POST /inspect-batch
POST /analyze-batch
POST /compare-analysis-snapshots
```

## Validación

```bash
python -m unittest discover -s backend/tests -p "test*.py"
cd frontend && npm run build
cd frontend && ./node_modules/.bin/tsc --noEmit
git diff --check
```

## Próximos bloques de producto

1. Validar Audit Core con empresas retail/e-commerce reales.
2. Persistir organizaciones, análisis, decisiones y seguimiento.
3. Incorporar seguridad SaaS: autenticación, aislamiento por tenant, RBAC, auditoría y borrado de datos.
4. Medir resultado observado frente a estimación.
5. Añadir una segunda plantilla sectorial únicamente tras validar la primera.
6. Ampliar a documentos e integraciones con revisión humana cuando la fuente sea ambigua.

## Seguridad y datos

No introducir datos reales, secretos o integraciones de clientes en el repositorio. La preparación para producción requiere almacenamiento privado de archivos, aislamiento estricto por empresa, permisos, trazabilidad y políticas de retención antes de comercializar la aplicación.
