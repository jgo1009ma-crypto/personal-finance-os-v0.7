# Phase 8.1 — Legacy Tracker Integration

Version: **0.8.1**

## Goal

Use the pre-app `Finanzas_Personales_v2.xlsx` tracker to recover useful historical/current-cycle context without allowing an older spreadsheet to overwrite the live ledger or create duplicate spending.

## Delivered

- Immutable representation of the workbook's October 2026 rows and Oct 2026–Jan 2027 monthly/source totals.
- Reports UI with historical trend, source concentration, known-income comparison and variable-budget variance.
- Reviewable import candidates with a mandatory real-date prompt.
- Stable duplicate guard through `sourceImportId`.
- Full-principal MSI import semantics for the detected iPhone financing.
- Derived Liverpool commitment schedule that closes the plan-level data gap left by the source PDF.
- Read-only Copilot tool for tracker analysis.
- Regression coverage for report totals, imports, duplicate prevention and Liverpool schedules.

## Data-quality rule

Legacy tracker data is explicitly labeled secondary/derived. Current user-maintained configuration and reconciled statement data remain authoritative.

## API

- `GET /api/v1/reports/legacy-tracker`
- `POST /api/v1/reports/legacy-tracker/items/:id/import` with `{ "date": "YYYY-MM-DD" }`

## Persistence

No Neon DDL migration is required. Confirmed rows use the existing transaction model. The static tracker representation is application code, while imported items persist in `app_state` like any other transaction.

## Safety

The Reports module never mutates balances on page load. A candidate import is explicit, date-gated and duplicate-protected. Ambiguous rows are intentionally non-importable from this workflow.
