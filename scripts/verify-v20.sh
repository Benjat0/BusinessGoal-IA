#!/usr/bin/env bash
set -euo pipefail

section() {
  printf '\n== %s ==\n' "$1"
}

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

BACKEND_PYTHON="python3"
if [[ -x "backend/.venv/bin/python" ]]; then
  BACKEND_PYTHON="backend/.venv/bin/python"
fi

section "Backend tests"
"$BACKEND_PYTHON" -m unittest discover -s backend/tests -p "test*.py"
echo "Backend tests OK"

section "Frontend build"
(
  cd frontend
  npm run build
)
echo "Frontend build OK"

section "TypeScript"
(
  cd frontend
  ./node_modules/.bin/tsc --noEmit
)
echo "TypeScript OK"

section "Git diff check"
git diff --check
echo "Git diff OK"

section "Language audits"
if command -v rg >/dev/null 2>&1; then
  prohibited_claims="causa raíz|Causa raíz|root cause|Root Cause|driver confirmado|Drivers confirmados|demuestra que|causa confirmada|Objetivo alcanzado|objetivo alcanzado|Impacto conseguido|impacto conseguido|BusinessGoal mejoró|probabilidad de éxito"
  if rg "$prohibited_claims" frontend/src backend/core -n; then
    echo "Prohibited language found." >&2
    exit 1
  fi

  required_terms=(
    "economic_driver_tree"
    "EconomicDriverTree"
    "Árbol económico"
    "Hipótesis de causa"
    "Señales observadas"
    "Limitaciones de datos"
  )
  for term in "${required_terms[@]}"; do
    if ! rg "$term" frontend/src backend -n >/dev/null; then
      echo "Missing economic tree audit term: $term" >&2
      exit 1
    fi
  done
else
  echo "WARNING: rg not available; skipping language and economic tree audits."
fi
echo "Audits OK"

section "Result"
echo "Backend tests OK"
echo "Frontend build OK"
echo "TypeScript OK"
echo "Git diff OK"
echo "Audits OK"
echo "VERIFY V20 OK"
