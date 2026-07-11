# VALIDATION CHECKLIST

## Backend

Ejecutar:

python -m unittest discover -s backend/tests -p "test*.py"

Reportar literalmente:

Ran X tests in ...
OK

## Frontend

Ejecutar desde frontend:

npm run build

Si aplica:

./node_modules/.bin/tsc --noEmit

Restaurar next-env.d.ts si el build lo modifica accidentalmente.

## Git

Ejecutar:

git diff --check
git status --short
git log --oneline --decorate -12

## Auditorías recomendadas

Buscar claims peligrosos:

rg "generará|ahorrarás|conseguirás|Objetivo alcanzado|objetivo alcanzado|Impacto conseguido|impacto conseguido|probabilidad de éxito|BusinessGoal mejoró|Éxito" frontend/src backend -n

Buscar lenguaje de causalidad prematura:

rg "causa raíz|Causa raíz|root cause|Root Cause|driver confirmado" frontend/src backend -n

Buscar owner/equipo cuando esté prohibido:

rg "owner|responsable|Responsable|equipo|team|approval|aprobación" frontend/src backend -n

Buscar sumas económicas heterogéneas:

rg "Impacto total|impacto total|Beneficio total|beneficio total|Oportunidad total|oportunidad total|potential_recoverable_benefit|display_total|total_impact" frontend/src backend -n
