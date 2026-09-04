# Demo actual — BusinessGoal IA v21

## Objetivo

Mostrar cómo BusinessGoal convierte datos operativos de retail o e-commerce en una
lectura auditable. La demo no usa datos de clientes ni presenta estimaciones como
resultados garantizados.

## Archivos de muestra

- `samples/sample_retail_inventory.csv`: archivo combinado con catálogo,
  inventario, costes, precios y ventas.
- `samples/sample_inventory_only.csv`: muestra una auditoría parcial y las áreas
  que todavía no pueden evaluarse.
- `samples/sample_sales_only.csv`: permite comprobar la lectura de ventas sin
  afirmar una salud global del negocio.

## Flujo de la demo

1. Ejecuta backend y frontend siguiendo el README.
2. Abre **Nuevo análisis** y selecciona **Tengo todo en un archivo**.
3. Carga `sample_retail_inventory.csv`, inspecciona las columnas y genera el
   análisis con el perfil *Retail* y objetivo *Equilibrado*.
4. Revisa **Análisis** para ver decisiones priorizadas, evidencia y escenarios.
5. Abre **Datos** para ver el **Audit Core**: puntuación de preparación de datos,
   áreas evaluadas y límites del análisis.
6. Repite el flujo con `sample_inventory_only.csv` para comprobar que la interfaz
   marca el alcance como parcial y no muestra una puntuación global de salud
   empresarial.

## Resultado esperado

La muestra completa permite evaluar calidad de datos, inventario, ventas y parte de
rentabilidad. La muestra parcial hace visible qué entradas faltan para ampliar la
auditoría. Las decisiones y escenarios son hipótesis fundamentadas en los datos
cargados; requieren revisión humana antes de ejecutar una acción.
