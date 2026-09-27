# Phase 4 — Statement Import, Reconciliation, Card Lifecycle & Period Overrides

Version: **0.4.0**

## Scope delivered

### 1. Card lifecycle management
Cards are no longer hard-coded-only entities in the runtime data store.

Supported actions:
- add a card;
- edit its name, issuer, credit limit, statement close day, legal due rule, preferred pay day, APR and last four digits;
- archive a card;
- restore an archived card.

Archiving is intentionally non-destructive. Historical transactions, statements and debt remain queryable. Outstanding debt continues to count in the financial balance sheet even if a card is archived.

### 2. Period-specific recurring expense overrides
A recurring rule now acts as a baseline, not as an immutable statement of what every future month must cost.

Examples:
- `Croquetas gatos`: base MXN 600/month, October override MXN 725;
- `Luz`: base MXN 350 every two months, October actual MXN 520;
- an `every_n_days` expense can be overridden by month or by an exact occurrence date.

The override changes only the selected period. Past and future periods preserve the original baseline unless they receive their own override.

### 3. Statement import pipeline
The local prototype accepts PDF or TXT statements.

Pipeline:

1. upload file;
2. extract text;
3. parse statement summary;
4. parse movement rows;
5. fingerprint imported rows;
6. compare them with canonical transactions;
7. classify each row as `matched`, `possible_match`, `new`, or `ignored`;
8. require review for ambiguous rows;
9. commit new rows;
10. update the official card snapshot only after commit.

### 4. Reconciliation model
Automatic matching combines:
- exact amount tolerance;
- transaction date proximity;
- normalized description token similarity;
- debit/credit direction.

A second import of the same Banamex statement after the first one was committed matched all 25 parsed transactions instead of duplicating them.

### 5. Statement summary extraction
The parser currently extracts when present:
- statement date;
- period start/end;
- legal payment due date;
- payment to avoid interest;
- total balance;
- regular balance;
- installment balance;
- available credit;
- data-quality state.

If a statement is internally inconsistent (Nu is the current real example), the application preserves the warning and uses component balances as an operational balance rather than silently accepting a contradictory reported zero.

## Regression validation against the supplied real statements

The v0.4 parser was exercised against the actual files used to design the application:

| Card | Parsed regular movement rows | Statement date | Total balance result |
| --- | ---: | --- | ---: |
| Banamex Clásica | 25 | 2026-09-11 | MXN 17,163.57 |
| Banamex Joy | 6 | 2026-09-17 | MXN 37,068.04 |
| BBVA Azul | 20 | 2026-09-12 | MXN 47,937.27 |
| Nu | 22 | 2026-09-05 | inconsistent, operational balance uses components |

Liverpool's PDF uses a font/text encoding that `pdftotext` does not decode reliably. The import layer therefore exposes a parser adapter boundary and accepts TXT as a fallback. OCR/serverless-native PDF extraction belongs in the deployment phase rather than being buried inside the financial engine.

## API added in v0.4

- `POST /api/v1/cards`
- `PATCH /api/v1/cards/:id`
- `DELETE /api/v1/cards/:id` (archive)
- `POST /api/v1/cards/:id/restore`
- `GET /api/v1/recurring/month?month=YYYY-MM`
- `PUT /api/v1/recurring/:id/overrides/:periodKey`
- `GET /api/v1/imports`
- `POST /api/v1/imports?cardId=...&filename=...`
- `GET /api/v1/imports/:id`
- `PATCH /api/v1/imports/:id/rows/:rowId`
- `POST /api/v1/imports/:id/commit`

## Database migration

`db/migrations/003_phase4_management_reconciliation.sql` adds:
- recurring period overrides;
- richer import metadata;
- row fingerprint/match metadata;
- indexes for account lifecycle and reconciliation.

## Current extraction adapter

The local runtime uses `pdftotext -layout` when a PDF is uploaded. TXT files are accepted directly.

This is intentionally behind an adapter boundary. A hosted/serverless deployment should use a JavaScript/serverless-compatible PDF parser or managed document extraction service. No financial logic depends on the extraction provider.

## Tests

Validated in v0.4:
- billing cycle projection;
- preferred personal payment day;
- MSI schedule;
- live card balance;
- card payment exclusion from spending;
- debt extra-payment simulator;
- add/archive/restore card;
- monthly recurring override;
- bimonthly CFE-style override;
- statement movement parsing;
- statement summary parsing;
- import commit;
- duplicate statement reconciliation;
- real Banamex/BBVA/Nu PDF regression parsing.

## Next phase

Phase 5 should build the full financial simulator and cash-flow engine on top of reconciled data:
- daily cash position;
- actual recurring values by period;
- statement payment dates;
- debt amortization events;
- scenario branches (`what if I buy/pay/save X?`);
- baseline vs scenario comparison;
- projected debt-free date;
- emergency-fund trajectory.
