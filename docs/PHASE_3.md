# Phase 3 — Web Application v0.3

## Status
Core web application is implemented and runs locally without third-party runtime dependencies.

## Why the current UI is dependency-free
The long-term deployment target can still be Next.js/Vercel, but this phase deliberately ships an executable UI that can be tested in the offline build environment. The UI consumes the same HTTP API contract and repository abstraction that a future Next.js client will consume, so the financial domain logic remains framework-independent.

## Implemented screens
### Overview
- Total live debt.
- Interest-bearing debt.
- Monthly recurring fixed cost.
- Free income before variable spending/installments.
- Total credit limit and portfolio utilization.
- Per-card balances and utilization.
- Data-quality warnings for statement inconsistencies.

### Cards
- One dashboard per card.
- Baseline statement balance + subsequent captured transactions.
- Live utilization.
- Payment-to-avoid-interest reference.
- Statement-close and preferred-payment rules.
- Card-specific transaction history.

### Transactions
- Persistent local transaction ledger.
- Purchases, payments, refunds, subscriptions, fees, interest and cash advances.
- Regular, MSI and interest-plan financing classification.
- Automatic statement close, legal due date and personal payment date projection.
- MSI schedule preview before saving.
- Card payments reduce debt but are not counted as consumption.

### Debt
- Current interest-bearing plans.
- APR, principal, scheduled payment and remaining term.
- Extraordinary-payment simulator.
- Projected interest+tax savings and payments removed.

### Recurring
- All known recurring rules.
- Monthly, bimonthly and every-N-days frequencies.
- UVM family support represented as offset income.
- Monthly net equivalent.

## Persistence
`data/user-data.json` is used as a local persistence adapter for captured transactions. It is intentionally replaceable by the PostgreSQL repository defined in Phase 2.

The transaction ledger is append-only in v0.3. Database-backed editing, deletion and audit history will be enabled with the PostgreSQL adapter.

## Live balance rule
For each card:

`live balance = reconciled statement baseline + purchases/fees/interest after baseline - payments/refunds after baseline`

This is a major correctness rule. A card payment is a balance-sheet transfer, not a second expense.

## Data quality
- Banamex Clásica, Joy and BBVA use official statement totals.
- Nu is marked `inconsistent` because the supplied statement's component balances do not reconcile with its reported available credit/total.
- Liverpool is marked `estimated` where derived fields are necessary.

The application preserves those flags instead of silently inventing a reconciliation.

## API endpoints now used by the UI
- `GET /api/v1/bootstrap`
- `GET /api/v1/overview`
- `GET /api/v1/cards/:id`
- `GET /api/v1/transactions`
- `POST /api/v1/transactions`
- `POST /api/v1/cards/:id/project-purchase`
- `GET /api/v1/debt-plans`
- `POST /api/v1/debt-plans/:id/simulate-extra-payment`
- `GET /api/v1/recurring`

## Verification
The following were executed successfully:
- Core TypeScript compile.
- Billing-cycle regression tests.
- Application-service TypeScript compile.
- Purchase/MSI projection tests.
- Live-balance tests.
- Card-payment no-double-counting tests.
- Debt-extra-payment simulation tests.
- HTTP API smoke tests.
- Frontend JavaScript syntax validation.

## Phase 3 remaining production work
The user-facing Phase 3 experience is functional. Production hardening that depends on external infrastructure remains:
- PostgreSQL repository activation.
- Authentication/session isolation.
- HTTPS deployment.
- Server-side validation library / request schemas.
- Next.js/Vercel shell if desired for deployment and SSR.

These do not block local use or Phase 4 statement-import development.
