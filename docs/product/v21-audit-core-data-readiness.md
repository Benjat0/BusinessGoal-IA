# BusinessGoal v21.0 — Audit Core & Data Readiness

## Objetivo

Convertir el análisis existente de catálogo, ventas e inventario en una auditoría explícita sobre el alcance que permiten los datos.

BusinessGoal no debe emitir una lectura global de una empresa cuando solo dispone de una parte de su información. El Audit Core muestra qué áreas son evaluables, cuáles no, qué evidencia las soporta y qué datos ampliarían la auditoría.

## Lo que incluye esta fase

- Contrato backend `audit_core` dentro de cada respuesta de análisis.
- `Data Readiness Score` basado en validación de archivo, confianza del mapeo, cobertura real de métricas y calidad de cruce multiarchivo.
- Áreas de auditoría:
  - calidad y cobertura de datos;
  - rentabilidad de catálogo;
  - inventario y capital;
  - actividad comercial;
  - clientes y concentración;
  - operaciones y capacidad.
- Estados por área: `ASSESSED`, `NOT_ASSESSED` o `NOT_AVAILABLE`.
- Petición concreta de datos adicionales para cada área no evaluable.
- Superficie visible en la pestaña Datos.
- Pruebas de contrato, datos completos, datos escasos y serialización JSON estricta.

## Principios

- `MISSING != ZERO`.
- Un área sin datos no es un área saludable.
- La calidad de datos es distinta de la salud económica.
- No existe una puntuación global de salud empresarial en esta fase.
- Las decisiones conservan estimaciones, supuestos y riesgos; no son resultados garantizados.
- Los cálculos críticos siguen siendo deterministas y auditables.

## Fuera de alcance

- Base de datos, autenticación, multitenancy o RBAC.
- Integraciones externas, OCR, PDF, Word o IA generativa.
- Métricas de clientes u operaciones sin una plantilla de datos específica.
- Tracking causal o atribución de resultado.
- Predicción avanzada, optimización o ejecución automática de acciones.
- Rediseño global de interfaz.

## Contrato resumido

```text
fuentes cargadas
  → validación y mapeo
  → cobertura de métricas
  → Data Readiness
  → áreas auditables / no auditables
  → decisiones económicas existentes
```

El campo `audit_core` devuelve:

- `data_readiness`: puntuación, nivel de confianza y componentes.
- `areas`: estado, confianza, faltas y siguientes entradas necesarias.
- `business_health_score`: bloqueado explícitamente mientras la auditoría sea parcial.
- `limitations`: límites que deben mostrarse al usuario.

## Criterio de salida

La fase está lista para revisión cuando:

- los análisis simples y multiarchivo devuelven `audit_core`;
- los datos escasos no generan una salud global ficticia;
- frontend y backend comparten contrato;
- pruebas backend, build y TypeScript finalizan correctamente;
- se revisa el resultado con datos retail reales antes de ampliarlo a otro sector.
