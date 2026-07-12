# BUSINESSGOAL v20.x — POLISH TEMPLATE

Lee y sigue estrictamente los protocolos base de `docs/codex-prompts/`.

## Fase

`BUSINESSGOAL v20.x.y — <polish>`

## Base

- Base obligatoria:
- Commit esperado:
- Worktree:
- Branch:

## Reglas

- Cambios mínimos y localizados.
- No merge.
- No tag.
- No modificar main.
- No tocar stash.
- No introducir lógica económica nueva salvo autorización explícita.
- No rediseñar la app.
- Evitar regresiones en lifecycle, persistencia, legacy y demo.

## Objetivo

Describe el ajuste de UX/copy/refactor y por qué mejora la claridad del producto.

## Alcance

- Archivos esperados:
- Copy/UI exacto:
- Estados afectados:
- Estados no afectados:

## Validación

Ejecuta:

```bash
./scripts/verify-v20.sh
```

Y reporta explícitamente:

- Backend tests.
- `npm run build`.
- `./node_modules/.bin/tsc --noEmit`.
- `git diff --check`.
- Auditorías de lenguaje.

Si no hay screenshots, incluye una descripción visual precisa de lo cambiado y dónde verlo.

## Informe Final

Incluye cambios, validación, screenshots o descripción visual, riesgos residuales y confirmación de main/tags/stash intactos.

Finaliza con:

`V20.x.y MERGE READINESS: READY`

o:

`V20.x.y MERGE READINESS: NOT READY`
