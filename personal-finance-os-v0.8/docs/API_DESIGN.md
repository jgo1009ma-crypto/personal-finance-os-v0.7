# API Design — v0.2

## Boundary
The API is an application layer over the deterministic financial engine. It does not let the UI recalculate financial rules independently. The database stores canonical movements and official statement facts; forecasts remain derived.

## Transaction creation
`POST /v1/transactions` performs, atomically:
1. validate transaction input;
2. resolve card + effective rule version;
3. save canonical transaction;
4. project closing date, legal due date, preferred payment date and payment month;
5. when MSI, create an installment plan and schedule;
6. invalidate forecast cache / create a new forecast run.

The current v0.2 implementation includes steps 1–4 in an in-memory repository and returns the MSI schedule from the core engine. PostgreSQL persistence is the next adapter.

## Payment semantics
A card payment is never an expense. It is linked through `transfer_links` and may be allocated via `payment_allocations` to a statement, scheduled installment, interest, tax, fee or extra principal.

## Reconciliation
Imported PDF rows are staged in `import_rows`. They are never written directly to `transactions`. Candidate matches are stored with a confidence score in `reconciliation_matches`. Only reviewed/committed rows become canonical.

## Forecasting
Forecasts are immutable runs (`forecast_runs` + `forecast_items`) with engine version and assumptions. This means a historical forecast can be explained later instead of mysteriously changing when code changes.

## Idempotency
Production write endpoints will accept an `Idempotency-Key` header. Imports additionally use a source checksum and bank external IDs when available.

## Error model
Planned format:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "MSI requires installments >= 2",
    "details": {"field":"installments"}
  }
}
```

## Security
- Full PAN/CVV is never stored.
- Only last4 may be stored for display and import matching.
- Database secrets remain server-side.
- A future multi-user release will enforce PostgreSQL RLS in addition to application authorization.
- The Financial Copilot is read-only by default and cannot move money.
