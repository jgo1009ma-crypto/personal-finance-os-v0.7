# Phase 2 — Database + API Foundation

## Completed
- Additive PostgreSQL migration v0.2.
- Versioned credit-card billing rules.
- Persisted purchase projections.
- Payment/transfer linking to prevent double-counting.
- Explicit payment allocation to statements/debt plans.
- Import staging and reconciliation candidate model.
- Recurring-charge occurrence model.
- Merchant normalization and categorization rules.
- Balance snapshots.
- Reproducible forecast runs.
- Audit events.
- User financial policy/preferences.
- Initial statement seed with source-quality flags.
- OpenAPI contract.
- Compilable service layer.
- In-memory repository for deterministic tests before cloud persistence.
- Runnable HTTP prototype exposing core endpoints.

## Important correction from v0.1
The preferred payment date now means the latest preferred day after statement close and before the legal due date. This matches the actual behavior of paying most cards on the 30th even when the legal due date is early in the following month.

Example:
- Purchase: 13 Oct 2026, Banamex Clásica
- Close: 11 Nov 2026
- Legal due: 5 Dec 2026
- Personal payment date: 30 Nov 2026
- Budget/payment month: November 2026

Nu is configured with preferred payment day 9, matching the first payroll date.

## Verification performed
- TypeScript core compilation: pass.
- Billing-cycle tests: pass.
- API service tests: pass.
- HTTP smoke tests: pass.
- Extra-payment simulation: pass.

## Not yet applied to a live cloud database
The SQL migration is staged but has not been applied to a Neon production project because this chat session does not expose a selectable Neon project ID. No production data was mutated.

## Next phase
Web application shell:
- Next.js App Router.
- Overview dashboard.
- Cards dashboard.
- Add-transaction flow.
- Debt simulator.
- PostgreSQL adapter / Neon connection.
- Authentication boundary.
