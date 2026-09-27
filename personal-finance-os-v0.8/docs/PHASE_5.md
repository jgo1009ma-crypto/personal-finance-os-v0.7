# Phase 5 — Cash Flow, Forecasting & Scenario Engine

Version: **v0.5.0**

## Scope completed

Phase 5 turns reconciled transactions, statement snapshots, recurring expenses and debt plans into forward-looking financial planning.

### 1. Liverpool billing semantics corrected

Liverpool is modeled as:

- statement close: day **27**;
- legal payment day: day **27 of the following month**;
- no generic day-30 personal override.

This is deliberately represented as `fixed_day: 27`, not `30 days after close`, because month length changes. Example:

```text
Purchase included in close: 27-Sep-2026
Legal / expected payment:   27-Oct-2026
```

The September source snapshot is anchored to the actual 27-Aug-2026 close shown in the supplied statement.

### 2. Daily cash-flow forecast

The forecasting engine projects:

- salary on the 9th and 24th;
- the known MXN 12,000 company cash inflow in October 2026;
- recurring expenses with period-specific overrides;
- family support for UVM as a separate cash inflow;
- current reconciled statement payments;
- known MSI commitments extracted from supplied statements;
- interest-bearing debt amortization;
- manually captured future card purchases;
- planning-only variable-spend envelopes.

The forecast produces both individual cash events and monthly rollups.

### 3. Timing-aware recurring charges

Recurring items with a known credit card are projected to the expected **card payment date**, not treated as immediate cash outflow. Currently seeded from the supplied statements:

- UVM -> Banamex Clásica;
- Google -> Banamex Clásica;
- Telcel -> Banamex Joy;
- HBO -> Banamex Joy;
- ChatGPT -> Nu.

Recurring items without a known payment instrument remain on their configured occurrence date and are marked as planning assumptions.

### 4. Known installment commitments

The engine now maintains a planning layer for known zero-interest installments extracted from the September statements. This is separate from canonical card balances.

Liverpool plan-level future installments are intentionally excluded because the supplied PDF's embedded font encoding does not provide a reliable text-level breakdown. The current official/estimated statement payment is still projected correctly.

### 5. Debt projection

Interest-bearing plans are amortized month by month. The forecast returns a debt timeline containing:

- interest-bearing principal remaining;
- known zero-interest installment balance;
- combined known committed balance;
- scheduled monthly debt payments.

### 6. Emergency-fund planning

Preferences now store:

- current liquid cash;
- variable-spend target;
- emergency-fund balance;
- emergency-fund target in months;
- forecast horizon;
- MSI-to-income threshold;
- credit-utilization threshold.

The default emergency-fund target is three months of net recurring expenses.

### 7. Scenario simulator

A scenario can combine, without mutating real transactions:

- extraordinary principal payment;
- hypothetical regular or MSI purchase;
- one-time future income.

The API returns baseline and scenario forecasts plus deltas for:

- ending cash;
- minimum cash;
- negative-liquidity days;
- total outflow;
- interest + IVA saved;
- scheduled payments eliminated.

Example already regression-tested:

```text
BBVA extra principal: MXN 10,500
Projected interest + IVA saved: about MXN 1,954.94
Scheduled payments eliminated: 6
```

This is based on the current aggregate BBVA Efectivo Inmediato model and remains a projection until each bank plan is fully reconciled at plan level.

### 8. Web modules activated

The browser app now includes:

- **Cash flow** dashboard;
- **Simulator** dashboard;
- **Presupuestos** planning preferences.

The Cash Flow dashboard shows monthly flows, daily upcoming events, emergency-fund progress and known debt commitments.

## API additions

```text
GET /api/v1/preferences
PUT /api/v1/preferences
GET /api/v1/forecast
POST /api/v1/scenarios/simulate
```

## PostgreSQL

Migration added:

```text
db/migrations/004_phase5_forecasting_scenarios.sql
```

It adds persistent planning preferences, scenario runs and planning commitments while keeping simulations isolated from canonical transaction history.

## Test coverage

Phase 5 regression tests include:

- Liverpool 27 -> 27 month-in-arrears billing;
- salary date projection;
- emergency-fund target;
- multi-month debt timeline;
- BBVA extra-payment interest savings;
- hypothetical MSI purchase scheduling;
- full existing Phase 1-4 suite.

## Known limitations

1. `openingCash` must be set to the user's actual liquid balance for daily minimum cash to be meaningful.
2. The MXN 18,000 December aguinaldo is not included in baseline because its exact payment date has not been provided. It can be entered in the simulator once known.
3. Some recurring charge dates are planning defaults because the user specified frequency and amount but not exact charge day.
4. Liverpool plan-level future installments need either a better PDF extraction adapter or future statements with extractable plan data.
5. An extra debt payment scheduled after the next contractual payment is currently flagged as an approximation; the v0.5 exact path is strongest for an immediate pre-next-payment principal reduction.
