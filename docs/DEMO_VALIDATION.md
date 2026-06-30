# Validación demo — BusinessGoal IA MVP v18

## Estado

Versión validada como:

**BusinessGoal IA MVP Demo Ready v18 — Export & Sidebar Fix**

## Rama y tag estables

* Rama principal: `main`
* Rama estable demo: `mvp-demo-ready`
* Tag estable: `v18-demo-ready`
* Rama de ajustes menores: `chore/final-demo-polish`

## Validación backend

Resultado: OK

Comandos utilizados:

* `cd backend`
* `source .venv/bin/activate`
* `pip install -r requirements.txt`
* `python -m py_compile main.py`
* `uvicorn main:app --reload`

Endpoint validado:

* `http://127.0.0.1:8000/health`

Resultado esperado:

* `status: ok`
* `message: BusinessGoal backend is running`

## Validación frontend

Resultado: OK

Comandos utilizados:

* `cd frontend`
* `npm install`
* `npm run build`
* `npm run dev`

Resultado del build:

* Compilación correcta.
* TypeScript correcto.
* Generación de páginas correcta.
* App disponible en `http://localhost:3000`.

## Archivos demo

Archivos disponibles en `samples/`:

* `sample_inventory_only.csv`
* `sample_retail_inventory.csv`
* `sample_sales_only.csv`

## Checklist funcional demo

* [x] Backend arranca correctamente.
* [x] Frontend arranca correctamente.
* [x] Build frontend pasa correctamente.
* [x] Se puede abrir la aplicación localmente.
* [x] Existen archivos demo en `samples/`.
* [x] Se puede probar la demo localmente.
* [ ] Se puede subir inventario + ventas.
* [ ] Se inspeccionan columnas.
* [ ] Se genera análisis.
* [ ] Dashboard muestra KPIs.
* [ ] Decision Feed muestra recomendaciones.
* [ ] Productos exporta CSV.
* [ ] Inventario exporta CSV.
* [ ] Ventas exporta CSV.
* [ ] Historial es accesible.
* [ ] Historial exporta CSV.
* [ ] Informe ejecutivo se puede imprimir/exportar como PDF.

## Notas

Durante `npm install` aparecen 2 vulnerabilidades moderadas.

No se ha ejecutado `npm audit fix --force`.

Motivo: puede introducir cambios incompatibles o alterar dependencias. Se deja como revisión futura fuera de la estabilización del MVP.

## Conclusión

La versión actual queda preparada como demo funcional del MVP. Las futuras mejoras deben hacerse en ramas separadas y no directamente sobre `mvp-demo-ready`.
