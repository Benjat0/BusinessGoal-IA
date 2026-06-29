# BusinessGoal IA MVP v15 — Scenario Simulator

## Objetivo

Añadir una capa de simulación ejecutiva para que el usuario pueda comparar escenarios de ejecución después del análisis económico.

## Nuevo objeto backend

`scenario_simulation`

Incluye:

- `total_detected_potential`
- `high_priority_actions`
- `key_levers`
- `scenarios`
- `recommended_scenario`
- `warning`

## Escenarios

1. **Prudente**: captura parcial y conservadora del impacto detectado.
2. **Recomendado**: equilibrio entre impacto, confianza y facilidad de ejecución.
3. **Intensivo**: mayor impacto potencial, pero más riesgo operativo.

## Principio de producto

El simulador no debe prometer rentabilidad. Debe servir para priorizar decisiones y comunicar posibles rangos de impacto.
