#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
rm -rf core/dist server/dist
npx tsc -p core/tsconfig.json
node core/dist/test/billing.spec.js
node core/dist/test/demo.js >/dev/null
npx tsc -p server/tsconfig.json
node server/dist/server/test/service.spec.js
node server/dist/server/test/import.spec.js
node server/dist/server/test/forecast.spec.js
node server/dist/server/test/copilot.spec.js
node server/dist/server/test/legacy-tracker.spec.js
node --check api/index.js
node --check production/state-store.js
node --check production/auth.js
node --check public/app.js
node --check public/login.js
node --check public/sw.js
node --check server/server.js
mkdir -p /tmp/pfos-stub/node_modules/@neondatabase/serverless
printf "exports.neon=()=>{};\n" >/tmp/pfos-stub/node_modules/@neondatabase/serverless/index.js
NODE_PATH=/tmp/pfos-stub/node_modules node -e "const h=require('./api/index.js'); if(typeof h!=='function') throw new Error('production handler missing'); console.log('production bundle require: ok')"
grep -q ':root\[data-theme="dark"\]' public/styles.css
grep -q 'max-width:1024px' public/styles.css
grep -q 'viewport-fit=cover' public/index.html
test -s public/manifest.webmanifest
test -s public/sw.js
test -s public/icons/icon-192.png
test -s public/icons/icon-512.png
echo 'mobile/dark/PWA static checks: ok'
python - <<'PY'
import json
from pathlib import Path
root=Path('.')
json.loads((root/'vercel.json').read_text())
json.loads((root/'package.json').read_text())
json.loads((root/'public/manifest.webmanifest').read_text())
print('json/config validation: ok')
PY
rm -f data/user-data.json
PORT=8877 node server/server.js > /tmp/pfos-v08-test.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true; rm -f data/user-data.json' EXIT
for i in {1..30}; do
  if curl -fsS http://127.0.0.1:8877/api/v1/health >/tmp/pfos-health.json 2>/dev/null; then break; fi
  sleep .2
done
node -e "const x=require('/tmp/pfos-health.json'); if(!x.ok||x.version!=='0.8.1') throw new Error('health failed')"
curl -fsS http://127.0.0.1:8877/api/v1/planning-summary?asOf=2026-09-27 >/tmp/pfos-planning.json
node -e "const x=require('/tmp/pfos-planning.json'); if(!Array.isArray(x.alerts)) throw new Error('planning smoke failed')"
curl -fsS -H 'content-type: application/json' -d '{"name":"Smoke Savings","type":"savings","balance":1000,"includeInNetWorth":true}' http://127.0.0.1:8877/api/v1/accounts >/tmp/pfos-account.json
node -e "const x=require('/tmp/pfos-account.json'); if(x.balance!==1000) throw new Error('account smoke failed')"
curl -fsS -H 'content-type: application/json' -d '{"name":"Smoke Goal","type":"purchase","targetAmount":5000,"currentAmount":1000,"priority":"medium"}' http://127.0.0.1:8877/api/v1/goals >/tmp/pfos-goal.json
node -e "const x=require('/tmp/pfos-goal.json'); if(x.targetAmount!==5000) throw new Error('goal smoke failed')"
curl -fsS http://127.0.0.1:8877/api/v1/reports/legacy-tracker >/tmp/pfos-legacy.json
node -e "const x=require('/tmp/pfos-legacy.json'); if(x.currentCycleTotal!==43728.86||x.candidateCount!==22) throw new Error('legacy tracker smoke failed')"
kill $PID
wait $PID 2>/dev/null || true
rm -f data/user-data.json
trap - EXIT
echo 'http smoke: ok'
echo 'all tests: ok'
