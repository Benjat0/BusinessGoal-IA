# BusinessGoal IA

**BusinessGoal IA** es una aplicación web/SaaS B2B orientada a analizar archivos de negocio, especialmente Excel y CSV de inventario, ventas y productos, para detectar oportunidades económicas, capital inmovilizado, riesgos operativos, margen mejorable y acciones recomendadas.

## Estado actual

**MVP Demo Ready v18 — Export & Sidebar Fix**

Esta versión está validada como demo funcional del MVP. El objetivo de esta rama es conservar una versión estable para demostraciones, pruebas internas y futuras evoluciones controladas.

## Funcionalidades principales

* Subida de archivos CSV, XLS y XLSX.
* Análisis de inventario, ventas y productos.
* Soporte para análisis multiarchivo:

  * archivo combinado,
  * inventario,
  * ventas.
* Inspección automática de columnas.
* Mapeo de campos de negocio.
* Cálculo de KPIs ejecutivos.
* Detección de:

  * capital inmovilizado,
  * exceso de stock,
  * riesgo de rotura,
  * productos con bajo margen,
  * oportunidades de mejora económica.
* Dashboard ejecutivo.
* Decision Feed con recomendaciones accionables.
* Vista de productos analizados.
* Historial local de análisis.
* Exportación CSV de:

  * productos,
  * inventario,
  * ventas,
  * historial.
* Informe ejecutivo exportable/imprimible como PDF desde el navegador.

## Stack técnico

### Frontend

* Next.js
* TypeScript
* React
* Tailwind CSS

### Backend

* FastAPI
* Python
* pandas
* openpyxl
* xlrd
* pydantic

## Estructura del proyecto

```text
BusinessGoal-IA/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── core/
│
├── frontend/
│   ├── package.json
│   ├── app/
│   ├── components/
│   └── ...
│
├── samples/
│   ├── sample_inventory_only.csv
│   ├── sample_retail_inventory.csv
│   └── sample_sales_only.csv
│
├── docs/
├── README.md
└── .gitignore
```

## Cómo ejecutar el backend

Desde la raíz del proyecto:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

El backend quedará disponible normalmente en:

```text
http://127.0.0.1:8000
```

Endpoint de salud:

```text
http://127.0.0.1:8000/health
```

## Endpoints principales del backend

```text
GET  /health
POST /inspect
POST /analyze
POST /inspect-batch
POST /analyze-batch
```

Los endpoints principales para la demo multiarchivo son:

```text
POST /inspect-batch
POST /analyze-batch
```

## Cómo ejecutar el frontend

Desde la raíz del proyecto:

```bash
cd frontend
npm install
npm run dev
```

Abrir en el navegador:

```text
http://localhost:3000
```

Para validar build de producción:

```bash
npm run build
```

## Flujo recomendado de prueba

1. Arrancar el backend.
2. Arrancar el frontend.
3. Abrir `http://localhost:3000`.
4. Subir archivos demo desde `samples/`:

   * `sample_inventory_only.csv`
   * `sample_sales_only.csv`
   * opcionalmente `sample_retail_inventory.csv`
5. Inspeccionar columnas.
6. Generar análisis.
7. Revisar:

   * KPIs ejecutivos,
   * Decision Feed,
   * productos,
   * inventario,
   * ventas,
   * historial,
   * informe ejecutivo.
8. Probar exportaciones CSV.
9. Probar impresión/exportación del informe como PDF desde el navegador.

## Notas de versión v18

Versión centrada en estabilizar la demo del MVP.

Correcciones principales:

* Los botones de exportación de Productos, Inventario y Ventas generan CSV correctamente.
* El historial permite exportar CSV.
* El sidebar usa un layout flexible.
* El bloque de ayuda/contacto ya no tapa el acceso a Historial.
* El menú lateral mantiene accesible la navegación en pantallas con menor altura.
* El informe ejecutivo puede imprimirse o exportarse como PDF desde el navegador.

Esta versión se considera:

```text
MVP Demo Ready
```

## Estrategia de ramas

* `main`: rama principal de desarrollo estable.
* `mvp-demo-ready`: rama congelada para demo del MVP v18.
* `v18-demo-ready`: tag de la versión estable validada.

Las futuras mejoras deben desarrollarse en ramas separadas, por ejemplo:

```text
feature/database
feature/auth
feature/real-files-validation
fix/export-buttons
refactor/frontend-components
```

No se deben desarrollar nuevas funcionalidades directamente sobre `mvp-demo-ready`.

## Checklist de validación MVP

* [ ] Backend arranca correctamente.
* [ ] Frontend arranca correctamente.
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

## Próximos pasos recomendados

Próximas fases sugeridas, sin aplicar todavía en esta versión:

1. Añadir base de datos.
2. Añadir autenticación de usuarios.
3. Crear cuentas de empresa.
4. Guardar análisis en backend.
5. Mejorar validación de archivos reales.
6. Preparar deploy.
7. Definir modelo de suscripción.
8. Añadir sistema de pagos.
9. Mejorar seguridad y control de datos.
10. Refactorizar componentes frontend cuando el MVP esté más validado.

## Estado de estabilidad

Esta versión no debe modificarse funcionalmente sin crear una rama nueva.

Para nuevas mejoras:

```bash
git checkout main
git pull origin main
git checkout -b feature/nombre-de-la-mejora
```

Después de validar la mejora, se podrá fusionar mediante pull request o merge controlado.
