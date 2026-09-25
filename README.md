# Personal Finance OS

Private personal-finance operating system prototype.

Current version: **v0.6.0**

## What works now

- Financial overview and live credit-card balances.
- Per-card dashboards.
- Manual purchases, payments, refunds, fees, interest and cash advances.
- Automatic statement-cycle and preferred-payment-date assignment.
- Liverpool-specific 27th close / 27th following-month payment rule.
- MSI payment schedule projection.
- Interest-bearing debt extra-payment simulation.
- Add/edit/archive/restore credit cards without deleting history.
- Recurring-expense baselines plus per-month / per-occurrence overrides.
- PDF/TXT statement import.
- Automatic transaction reconciliation and duplicate prevention.
- Official statement snapshot update only after review/commit.
- Daily and monthly cash-flow forecasting.
- Income scheduling for salary and known one-time inflows.
- Known MSI / interest-debt commitment timeline.
- Emergency-fund planning.
- Baseline-vs-scenario simulator for purchases, extra debt payments and one-time income.
- Persistent forecast preferences and risk thresholds.
- **Read-only AI Financial Copilot** with deterministic financial tools.
- Local Copilot fallback when no external AI key is configured.
- Local JSON persistence behind a repository abstraction ready for PostgreSQL/Neon.

## Run locally

Requirement: **Node.js 18+**. No npm install is required for the compiled runtime included in the ZIP.

On Windows, double-click or run:

```bat
run-app.cmd
```

On macOS/Linux:

```bash
./run-app.sh
```

or:

```bash
cd api
npm run serve
```

The downloadable package includes the compiled JavaScript runtime, so normal use does not require TypeScript compilation. Use `npm run dev` only when changing the TypeScript source.

Then open:

```text
http://localhost:8787
```

## Enable the AI Copilot

The app works without an API key using a limited deterministic local assistant. For flexible natural-language analysis, copy `.env.example` to `.env` in the project root and add your OpenAI API key:

```text
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.6-terra
OPENAI_REASONING_EFFORT=medium
```

Restart the app. The Copilot screen will show **OpenAI conectado**.

Important implementation details:

- The API key stays server-side and is never sent to browser JavaScript.
- The v0.6 Copilot is read-only. It can analyze and simulate, but cannot silently change transactions/cards/budgets.
- Financial arithmetic remains in the deterministic engine; the model selects tools and explains results.
- Conversation history is stored locally in `data/user-data.json` in this prototype.
- Do not commit `.env` or `data/user-data.json` to a repository.

## PDF statement import

The local adapter uses the `pdftotext` executable. On systems where it is unavailable, upload a TXT export of the statement instead.

The parser/reconciliation engine itself is provider-independent. A hosted deployment can replace this adapter with a serverless-compatible PDF/document extraction provider without changing the finance engine.

## Design rule: preserve history

Cards are archived rather than hard-deleted when removed from active use. Recurring expenses use period overrides instead of mutating their baseline. Statement imports are staged before they become canonical transactions. Copilot simulations stay outside real transactions.

Those decisions keep historical reports reproducible, which is apparently considered a luxury feature once spreadsheets become sufficiently adventurous.

## Project structure

```text
core/        deterministic billing/debt/recurring/forecast logic
api/         service layer, HTTP API, import/reconciliation and AI copilot orchestration
db/          PostgreSQL schema and migrations
web/         responsive browser application
data/        local runtime persistence (exclude from production source control)
docs/        architecture and phase reports
```

## Tests

```bash
./test-all.sh
```

Phase 6 includes a mocked Responses API tool-calling test. Tests never require or spend a real API key.

See `docs/SETUP_WINDOWS.md` for the Windows walkthrough, `docs/PHASE_6.md` for the Copilot architecture, `docs/PHASE_5.md` for forecasting/scenarios, and `docs/PHASE_4.md` for statement reconciliation.

## v0.7 — production deployment

The local application remains available for offline use. Production now has a separate Vercel/Neon path:

- static UI from `public/`
- Vercel Node function at `api/index.js`
- durable state in Neon Postgres
- signed private session cookie
- server-side OpenAI API key
- PDF.js statement parsing in cloud
- audit trail and state backups

See `docs/DEPLOYMENT.md` before deploying and `docs/LOCAL_TO_CLOUD.md` if your current local `data/user-data.json` contains data you want to preserve.
