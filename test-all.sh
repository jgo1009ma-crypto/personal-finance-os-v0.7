#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/core"
rm -rf dist
npx tsc
node dist/test/billing.spec.js
node dist/test/demo.js >/dev/null
cd ../api
npm test
