# Phase 8 — Product Polish + Planning

Version: **0.8.0**

## Scope

Phase 8 turns the application from a credit/debt/cash-flow console into a broader personal balance-sheet and planning tool while deliberately avoiding bank credential aggregation.

### 1. Accounts and net worth

A new `FinancialAccount` entity supports:

- checking
- savings
- cash
- investment
- other

Only user-defined labels, institution, type and balance are stored. Full account numbers, login credentials and banking secrets are outside the data model.

`PlanningSummary` calculates:

```text
total assets
liquid assets
total debt
net worth = assets - debt
```

If no asset accounts have been configured, the UI marks net worth as incomplete rather than pretending that zero assets is a confirmed fact.

### 2. Goals and sinking funds

Goals support target amount, saved amount, optional target date and priority. Contributions are recorded separately and update the goal balance.

For dated goals the deterministic service calculates:

```text
gap = target - current
months remaining
approximate required monthly contribution = gap / months remaining
```

Goal calculations are planning artifacts and do not create canonical spending transactions.

### 3. Emergency fund integration

Accounts can optionally be marked as emergency-fund accounts. When at least one is marked, their balances become the emergency-fund source of truth for planning. Otherwise the legacy `emergencyFundBalance` preference remains the fallback.

This preserves backwards compatibility while allowing the balance sheet to gradually become more complete.

### 4. Deterministic alerts

The alert engine currently detects:

- missing asset accounts / incomplete net worth
- active interest-bearing debt
- cards above the configured utilization threshold
- emergency-fund shortfall
- underfunded goals due within 90 days
- high aggregate payment-to-avoid-interest load

Alerts are produced by `FinanceService.planningSummary()`, not by the language model.

### 5. Dashboard personalization

New private UI state:

```text
theme: system | light | dark
dashboardMode: simple | standard | analytical
dashboardWidgets: [...]
```

Preset layouts can be customized by individual widget toggles. Preferences are stored inside the same encrypted-transport/private Neon application state as the rest of the app.

### 6. Dark mode

Dark mode is implemented through CSS variables and `data-theme="dark"` on the document root. `system` follows `prefers-color-scheme` and reacts to OS theme changes while the app is open.

No `unsafe-inline` script permission was added to CSP.

### 7. iPhone / iPad experience

Responsive work includes:

- `viewport-fit=cover`
- safe-area insets for top and bottom chrome
- mobile bottom navigation
- tablet/mobile sidebar drawer at <= 1024px
- touch-sized navigation/actions
- single-column financial cards on narrow phones
- horizontal scrolling only where tables structurally require it
- compact top bar
- sticky Copilot composer on mobile
- no hover-dependent primary interactions
- reduced-motion support

### 8. PWA support

Added:

```text
public/manifest.webmanifest
public/sw.js
public/icons/icon-192.png
public/icons/icon-512.png
```

The service worker is intentionally network-first and ignores `/api/*`. Financial API responses are never stored in Cache Storage by our worker.

### 9. Copilot additions

Read-only tools now include:

- `get_planning_summary`
- `list_accounts`
- `list_goals`

Net-worth and savings answers remain grounded through deterministic service calls.

## Persistence migration

No Neon DDL migration is needed from v0.7 to v0.8. `production/state-store.js` migrates aggregate state to version 8 on read and initializes missing arrays/preferences safely.

## API additions

```text
GET/POST  /api/v1/accounts
PATCH/DELETE /api/v1/accounts/:id
GET/POST  /api/v1/goals
PATCH/DELETE /api/v1/goals/:id
POST      /api/v1/goals/:id/contributions
GET       /api/v1/planning-summary
GET/PUT   /api/v1/ui-preferences
```

## Test coverage added

- account creation and balance validation
- goal creation and contribution flow
- net-worth calculation
- emergency-fund account sourcing
- goal-gap calculation
- UI preference persistence
- local HTTP smoke for planning/accounts/goals
- JS/config syntax validation
- production bundle path validation
