# Data Model v0.2

```mermaid
erDiagram
  USERS ||--o{ ACCOUNTS : owns
  ACCOUNTS ||--o| CREDIT_CARDS : specializes
  ACCOUNTS ||--o{ CARD_RULE_VERSIONS : rules
  USERS ||--o{ TRANSACTIONS : records
  ACCOUNTS ||--o{ TRANSACTIONS : posts
  TRANSACTIONS ||--o{ TRANSACTION_PROJECTIONS : projects
  ACCOUNTS ||--o{ STATEMENTS : closes
  STATEMENTS ||--o{ STATEMENT_TRANSACTIONS : contains
  TRANSACTIONS ||--o{ STATEMENT_TRANSACTIONS : included
  TRANSACTIONS ||--o| INSTALLMENT_PLANS : creates
  INSTALLMENT_PLANS ||--o{ INSTALLMENT_SCHEDULE : schedules
  INSTALLMENT_PLANS ||--o{ PAYMENT_ALLOCATIONS : receives
  TRANSACTIONS ||--o{ PAYMENT_ALLOCATIONS : allocates
  USERS ||--o{ RECURRING_RULES : configures
  RECURRING_RULES ||--o{ RECURRING_OCCURRENCES : predicts
  USERS ||--o{ IMPORTS : uploads
  IMPORTS ||--o{ IMPORT_ROWS : parses
  IMPORT_ROWS ||--o{ RECONCILIATION_MATCHES : proposes
  TRANSACTIONS ||--o{ RECONCILIATION_MATCHES : matches
  USERS ||--o{ FORECAST_RUNS : computes
  FORECAST_RUNS ||--o{ FORECAST_ITEMS : contains
  USERS ||--o{ AUDIT_EVENTS : audits
```

## Source-of-truth hierarchy
1. Canonical transaction events.
2. Reconciled official statements for closed cycles.
3. Explicit debt-plan terms and allocations.
4. Deterministic projections for open/future cycles.
5. Forecast assumptions.

A forecast never overwrites historical facts. A PDF import never writes directly into canonical transactions before reconciliation.

## Money semantics
- `purchase` / `subscription` / `fee` / `interest` can represent economic expense.
- `payment` and `transfer` move money but are not new consumption.
- `refund` reverses prior consumption.
- MSI preserves original purchase date/category while creating future payment obligations.
- Extra debt payments are allocated to principal explicitly.

## Statement inconsistencies
`statements.data_quality` and `metadata` preserve discrepancies instead of silently forcing a number to fit. For example, the initial Joy and Nu source statements contain values that do not fully reconcile at plan level, so the seed marks those snapshots `inconsistent` while preserving the official/derived figures.
