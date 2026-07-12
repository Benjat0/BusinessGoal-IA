# BUSINESSGOAL v20.x — RELEASE AUDIT TEMPLATE

Usa este checklist antes de merge/tag de una fase v20.x.

## Identificación

- Branch:
- Tag esperado:
- Commit esperado:
- Release message:

## Comparación Main Vs Branch

- Confirmar `main` actual.
- Confirmar `origin/<branch>`.
- Confirmar que la rama está basada en la fase esperada.
- Confirmar `behind_by 0` antes de release o explicar por qué no aplica.

## Estado Local

- Working tree clean.
- `git status --short` sin cambios.
- Stash histórico intacto.
- Tags existentes revisados.

## Validación

- `./scripts/verify-v20.sh` OK.
- Backend tests OK.
- Frontend build OK.
- TypeScript OK.
- `git diff --check` OK.
- Auditorías de lenguaje OK.

## Archivos Críticos

Revisar cambios en:

- `backend/core/`
- `backend/tests/`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/decision-center.ts`
- `frontend/src/features/decisions/`
- `frontend/src/features/home/`
- `.github/workflows/`
- `scripts/`

## Release Command

```bash
./scripts/release-branch.sh <branch> <tag> "<message>"
```

## Confirmaciones

- No usar force.
- No borrar ramas.
- No tocar stash.
- No crear tag si el merge falla.
- Confirmar tag local/remoto no existe antes de ejecutar release.
