# Changelog

## v0.6.0 — Phase 6

- Added read-only AI Financial Copilot module.
- Added optional OpenAI Responses API integration with server-side API key handling.
- Added deterministic local Copilot fallback when no API key is configured.
- Added 11 strict financial function tools for overview, cards, debt, forecasts, scenarios, recurrent expenses and transaction search.
- Preserved reasoning/tool-call items across Responses API tool rounds.
- Added sequential tool orchestration and compact audit traces.
- Added conversation sessions persisted locally.
- Added Copilot UI with session history, prompt shortcuts, provider status, tool traces and warnings.
- Added `.env.example` and root `.env` loading without extra dependencies.
- Added PostgreSQL migration `005_phase6_ai_copilot.sql`.
- Updated OpenAPI contract to v0.6.
- Added mocked OpenAI orchestration regression tests; no live API calls are made by tests.

## v0.5.0 — Phase 5

- Corrected Liverpool to close day 27 and pay day 27 of the following month.
- Corrected the Liverpool seed statement anchor to the 27-Aug-2026 close shown on the supplied statement.
- Added daily/monthly cash-flow forecasting.
- Added salary and known extraordinary-income scheduling.
- Added timing-aware recurring card charges.
- Added known zero-interest installment commitments from supplied statements.
- Added interest-bearing debt and known-commitment timeline.
- Added configurable opening cash, variable-spend target and emergency-fund settings.
- Added baseline-vs-scenario simulator for extra debt payments, purchases and future income.
- Added interest/IVA savings and liquidity-delta calculations.
- Activated Cash Flow, Simulator and Budget/Planning web modules.
- Added PostgreSQL migration `004_phase5_forecasting_scenarios.sql`.
- Updated HTTP API and OpenAPI contract to v0.5.
- Added Phase 5 regression tests.

## v0.4.0 — Phase 4

- Added card CRUD lifecycle: create, edit, archive, restore.
- Archive is non-destructive; historical debt/transactions remain part of the balance sheet.
- Added period-specific recurring expense overrides.
- Added UI month selector for recurring actuals.
- Added PDF/TXT statement upload and text-extraction adapter.
- Added Banamex/BBVA/Nu-compatible movement parsing for the supplied statements.
- Added statement summary extraction.
- Added transaction fingerprinting and confidence-based reconciliation.
- Added ambiguous-row review flow and import commit.
- Added duplicate-statement protection through transaction matching.
- Added official snapshot update after reconciliation.
- Added safeguards for internally inconsistent statement totals.
- Added PostgreSQL migration `003_phase4_management_reconciliation.sql`.
- Updated OpenAPI contract to v0.4.
- Added regression tests for card lifecycle, recurring overrides and statement imports.

## v0.3.0 — Phase 3

- Added executable responsive web UI.
- Added Overview, Cards, Transactions, Debt and Recurring dashboards.
- Added local JSON persistence.
- Added live balances and transaction capture.

## v0.2.0 — Phase 2

- Added PostgreSQL enterprise schema and API contracts.
- Added reconciliation-ready data model.

## v0.1.0 — Phase 1

- Added deterministic financial engine for billing cycles, MSI, recurring costs and debt simulation.

## v0.7.0 — Production / Cloud

- Added Vercel serverless API entrypoint.
- Added Neon Postgres durable state storage.
- Added optimistic revision locking to prevent silent lost updates.
- Added append-only audit events and pre-reconciliation backups.
- Added private single-user authentication with signed HttpOnly cookies.
- Added strict production security headers.
- Replaced OS `pdftotext` dependency in cloud with Mozilla PDF.js.
- Added cloud deployment, local-to-cloud migration and operational runbooks.
- Added a local-state import script for moving an existing v0.6 installation into Neon.
