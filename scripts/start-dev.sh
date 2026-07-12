#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"

BACKEND_CMD="cd '$ROOT/backend' && if [ -f .venv/bin/activate ]; then source .venv/bin/activate; fi && python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"
FRONTEND_CMD="cd '$ROOT/frontend' && npm run dev"

if [[ "$(uname -s)" == "Darwin" ]]; then
  osascript <<APPLESCRIPT
tell application "Terminal"
  do script "$BACKEND_CMD"
  do script "$FRONTEND_CMD"
  activate
end tell
APPLESCRIPT
else
  echo "Backend:"
  echo "$BACKEND_CMD"
  echo
  echo "Frontend:"
  echo "$FRONTEND_CMD"
fi
