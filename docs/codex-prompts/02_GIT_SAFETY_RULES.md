# GIT SAFETY RULES

Repositorio principal esperado:

/Users/benataguirrezabalaga/Downloads/businessgoal-ia-mvp-v18-export-sidebar-fix

Reglas:

- No modificar main directamente.
- No hacer merge a main.
- No crear tag.
- No mover tags existentes.
- No borrar ramas estables.
- No usar git reset --hard.
- No aplicar stash histórico.
- No borrar stash histórico.

Stash histórico conocido:

pre-v20-local-page-tsx

Tags protegidos:

v19-demo-ready
v20.0-foundation
v20.1-graphite-navigation
v20.2-decision-cockpit

Para cada fase:

- crear branch codex específica;
- preferir worktree aislado;
- verificar base exacta;
- push solo de la rama de trabajo;
- dejar main intacto.

Formato recomendado de worktree:

/private/tmp/businessgoal-<fase>
