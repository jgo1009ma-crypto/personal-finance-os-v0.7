# Changelog

## v0.8.1 — Legacy Tracker Integration

- Integrated `Finanzas_Personales_v2.xlsx` as a secondary historical/planning source without overwriting the live financial model.
- Added the Reports module with Oct 2026 tracker totals, Oct→Jan obligation runoff, payment-source concentration and budget comparison.
- Added 22 reviewable import candidates from the October cycle, of which 21 regular purchases total MXN 9,093.50 and one is a MXN 25,454 iPhone purchase at 13 MSI.
- Added explicit confirmation + real-date capture before a legacy candidate can affect balances.
- Added stable `legacy_tracker` source IDs and duplicate-import protection.
- Recovered Liverpool future installment detail from the tracker: Tablet, Xbox, Monitor Edith and Playeras.
- Preserved current app values when the old tracker conflicts with newer user-maintained figures such as rent or maintenance.
- Added the legacy tracker to the read-only Copilot toolset with source-quality guardrails.
- Added regression tests for report totals, candidate imports, duplicate prevention and Liverpool commitments.
- Bumped the PWA static cache to v0.8.1.

## v0.8.0 — Product Polish + Planning

- Added asset accounts and deterministic net-worth calculation.
- Added liquid-assets and emergency-fund account tagging.
- Added savings goals / sinking funds with dated monthly-contribution estimates.
- Added goal contribution records.
- Added deterministic planning alerts for utilization, interest debt, emergency-fund gaps, near-term goals and payment load.
- Added private UI preferences with System/Light/Dark theme support.
- Added Simple, Normal and Analytical dashboard presets plus per-widget visibility.
- Added iPhone/iPad safe-area handling, mobile bottom navigation, tablet drawer navigation and touch-first responsive layouts.
- Added PWA manifest, Apple touch icon and network-first service worker that excludes financial APIs from caching.
- Extended the read-only Copilot with planning summary, account and goal tools.
- Migrated aggregate application state to version 8 without requiring a Neon DDL migration.
- Fixed build output paths so TypeScript recompilation produces the exact bundle used by Vercel.
- Updated local server to serve the same `public/` UI used in production.
- Added Phase 8 API/service/smoke regression tests.

## 0.7.4
- Fixed Vercel cold-start crash caused by `production/state-store.js` importing ignored `core/dist` artifacts.
- Production now uses the compiled core bundled under `server/dist/core`, which is included in the deployment.
- Health endpoint reports `0.7.4`.

## v0.7.3
- Fixed production startup after the Vercel single-function layout move.
- `production/state-store.js` now imports statement snapshots from `server/dist/api/src/financial-snapshots` instead of the removed `api/dist` path.
- Verified the production handler can be required with only one file under `/api`.

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
