# BusinessGoal IA MVP v18 — Export & Sidebar Fix

Versión de corrección sobre v17 centrada en dos bugs detectados en prueba de usuario:

1. Botones de exportación de Productos, Inventario y Ventas no ejecutaban ninguna acción.
2. Bloque de ayuda/contacto del sidebar tapaba el acceso a Historial en algunas alturas de pantalla.

## Correcciones

- Los botones de exportación ahora generan CSV descargable en:
  - Productos → `businessgoal_productos.csv`
  - Inventario → `businessgoal_inventario.csv`
  - Ventas → `businessgoal_ventas.csv`
  - Historial → `businessgoal_historial_analisis.csv`
- El sidebar ahora usa layout flexible.
- El menú lateral hace scroll si la pantalla no tiene altura suficiente.
- El bloque de ayuda ya no está en posición absoluta y no tapa Historial.
- El botón de ayuda ahora lleva a Configuración en vez de ser un botón muerto.
- Se mantiene todo lo añadido en v17:
  - flujo guiado,
  - análisis multiarchivo,
  - dashboard dark executive,
  - secciones diferenciadas de Productos / Inventario / Ventas,
  - informe ejecutivo,
  - historial local,
  - PDF vía impresión.

## Validación realizada

- Frontend Next.js build: OK
- TypeScript: OK
- Backend Python compile: OK

## Ejecutar backend

```bash
cd businessgoal-ia-mvp-v18-export-sidebar-fix/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

## Ejecutar frontend

```bash
cd businessgoal-ia-mvp-v18-export-sidebar-fix/frontend
npm install
npm run dev
```

Abrir:

```text
http://localhost:3000
```

## Prueba recomendada

- Subir `samples/sample_inventory_only.csv` como Inventario.
- Subir `samples/sample_sales_only.csv` como Ventas.
- Generar análisis.
- Probar:
  - Productos → Exportar CSV
  - Inventario → Exportar CSV
  - Ventas → Exportar CSV
  - Historial → Exportar historial CSV
  - Acceso a Historial desde sidebar
