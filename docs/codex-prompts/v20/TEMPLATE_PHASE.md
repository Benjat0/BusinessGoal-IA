# BUSINESSGOAL v20.x — PHASE TEMPLATE

Lee y sigue estrictamente:

- `docs/codex-prompts/00_CODEX_BASE_PROTOCOL.md`
- `docs/codex-prompts/01_BUSINESSGOAL_PRODUCT_PRINCIPLES.md`
- `docs/codex-prompts/02_GIT_SAFETY_RULES.md`
- `docs/codex-prompts/03_VALIDATION_CHECKLIST.md`

## Fase

`BUSINESSGOAL v20.x — <nombre>`

## Base Commit/Tag

- Base obligatoria: `<main/tag/commit>`
- Commit esperado: `<sha>`

## Worktree

`/private/tmp/businessgoal-v20-x-<slug>`

## Branch

`codex/v20-x-<slug>`

## Reglas Git

- No hagas merge.
- No crees tag.
- No modifiques main.
- No apliques ni borres stash.
- No uses `git reset --hard`.

## Objetivo

Describe el resultado de producto esperado en 3-6 líneas.

## Alcance Incluido

- Backend:
- Frontend:
- Tests:
- Documentación:

## Fuera De Alcance

- No implementar fases futuras.
- No añadir IA generativa ni OpenAI API salvo autorización explícita.
- No rediseñar la app salvo que la fase lo pida.
- No cambiar contratos existentes sin tests y justificación.

## Backend

Define módulos, contratos y reglas de dominio. Mantén `MISSING != ZERO`, JSON estricto y lenguaje prudente.

## Frontend

Define vistas/componentes concretos. Mantén Graphite, no dupliques drawers ni introduzcas librerías nuevas sin necesidad.

## Tests

Indica tests backend y frontend esperados. Si no existe framework frontend, valida con build y TypeScript.

## Validación

Ejecuta:

```bash
./scripts/verify-v20.sh
```

Si el script no existe todavía o falla por entorno, ejecuta explícitamente:

```bash
python -m unittest discover -s backend/tests -p "test*.py"
cd frontend && npm run build
cd frontend && ./node_modules/.bin/tsc --noEmit
git diff --check
```

## Informe Final

Incluye base inicial, branch, HEAD final, commits, archivos cambiados, resumen backend, resumen frontend, tests, build, TypeScript, auditorías, estado de main, tags y stash.

Finaliza con:

`V20.x MERGE READINESS: READY`

o:

`V20.x MERGE READINESS: NOT READY`
