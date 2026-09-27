# Personal Finance OS architecture

## Current boundary map

```text
Web UI
  |
  v
HTTP API
  |
  +--> Finance Service ------------------------------+
  |       |                                          |
  |       +--> Billing / MSI engine                  |
  |       +--> Debt engine                           |
  |       +--> Recurring baseline + override engine  |
  |       +--> Statement reconciliation engine       |
  |                                                  |
  +--> Statement extraction adapter                  |
          |                                          |
          +--> local: pdftotext / TXT                |
          +--> future: serverless PDF/OCR provider   |
                                                     |
                                                     v
                                            Finance Repository
                                                     |
                                +--------------------+------------------+
                                |                                       |
                         local JSON v0.6                       PostgreSQL / Neon
                         development mode                       target persistence
```

## Accounting principles

1. Canonical transactions are the source of truth for spending.
2. Credit-card payments are balance transfers, not new spending.
3. Statement snapshots anchor balances at a point in time.
4. Imports are staged until reviewed and committed.
5. Recurring rules are immutable baselines; period overrides store actual variation.
6. Cards are archived instead of deleting their history.
7. Inconsistent bank statements are preserved and flagged rather than silently "fixed".

## Runtime persistence

The current browser prototype persists user changes in `data/user-data.json` behind `FinanceRepository`. PostgreSQL already has an enterprise schema and additive migrations. Swapping persistence should not require changing financial calculations or the browser contract.

## Security direction

Before public deployment:
- authenticated single-user/tenant boundary;
- server-side secrets only;
- encrypted database backups;
- no storage of full PAN/CVV;
- signed upload URLs or protected statement storage;
- import file retention policy;
- audit events for financial mutations;
- row-level authorization if multi-user support is ever introduced.


## Forecasting boundary

Forecasts and scenarios are derived planning artifacts, never canonical financial history.

```text
Canonical transactions + snapshots + recurring rules + debt plans
                            |
                            v
                    Forecast Engine
                       /        \
                 Baseline      Scenario
                    |             |
                    +------compare+
                            |
                            v
                 Cash / debt / risk deltas
```

A simulated purchase or extra payment is not written to `transactions` until the user records the event as real. This prevents hypothetical decisions from contaminating historical reports.

## Copilot boundary (v0.6)

The language model is not a financial calculation engine and does not receive direct repository access.

```text
Copilot UI
   |
   v
CopilotService
   |
   +--> local deterministic fallback
   |
   +--> optional OpenAI Responses API
             |
             v
       strict function calls
             |
             v
        FinanceService
             |
             v
      deterministic engine
```

The v0.6 Copilot is read-only. Every user-specific numeric answer should be grounded through FinanceService tools. Tool traces are retained for audit/debugging, while API credentials remain environment secrets and are not persisted in the app database.

## v0.7 production topology

Production is stateless at the compute layer. Vercel serves `public/` and routes `/api/*` to a Node.js function. The request-scoped service reads the current aggregate from Neon Postgres, applies deterministic finance logic, and persists mutations using optimistic revision checks. OpenAI credentials remain server-side. Statement PDFs are parsed with PDF.js rather than relying on an OS executable.

Operational tables:

- `app_state`: authoritative application aggregate and revision.
- `audit_events`: append-only mutation trail.
- `state_backups`: point snapshots before risky workflows such as statement reconciliation.

The normalized finance schema remains the long-term analytical model. The aggregate store is a deliberate migration bridge that preserves tested v0.6 behavior while moving persistence to cloud infrastructure.

## v0.8 balance-sheet and planning boundary

Phase 8 adds user-maintained assets and savings goals without introducing direct banking credentials or transaction aggregation.

```text
Asset accounts --------------------+
                                    |
Credit-card balances --------------+--> PlanningSummary --> Overview / Alerts / Copilot tools
                                    |
Financial preferences -------------+
                                    |
Savings goals + contributions -----+
```

`PlanningSummary` is deterministic. The Copilot may query it, but the language model does not calculate or mutate balances.

The production aggregate now carries version-8 fields:

```text
accounts
goals
goalContributions
uiPreferences
```

They are additive to the existing `app_state` JSON document, so the v0.7 Neon tables remain valid.

## v0.8 client topology

`public/` is now the single browser UI source for both local and Vercel runtimes.

```text
public/index.html
public/app.js
public/styles.css
public/manifest.webmanifest
public/sw.js
public/icons/*
```

The service worker caches only same-origin static GET resources and intentionally ignores `/api/*`. Mobile/tablet navigation and dark mode remain client presentation concerns; financial state is persisted through the API.
