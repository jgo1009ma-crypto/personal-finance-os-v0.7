#!/usr/bin/env bash
set -euo pipefail
if ! command -v node >/dev/null 2>&1; then
  echo "Personal Finance OS requiere Node.js 18 o superior." >&2
  exit 1
fi
cd "$(dirname "$0")/api"
echo "Personal Finance OS v0.6"
echo "Abre http://localhost:8787 en tu navegador."
node server.js
