# Personal Finance OS

Private personal-finance operating system.

Current version: **v0.8.0**

## What v0.8 adds

- **Accounts & Net Worth:** register checking, savings, cash, investment or other asset accounts without storing bank credentials or account numbers.
- **Goals / Sinking Funds:** create savings goals, record contributions, track funded percentage, remaining gap and approximate monthly contribution required for dated goals.
- **Deterministic Alerts:** credit-utilization thresholds, active interest debt, emergency-fund gap, near-term goals, data-completeness prompts and payment-load signals.
- **Customizable Overview:** Simple, Normal and Analytical presets plus individual dashboard widget visibility.
- **Dark mode:** System, Light and Dark themes stored in the private cloud state.
- **iPhone/iPad polish:** safe-area support, 44px-class touch targets, tablet drawer navigation, bottom mobile navigation, responsive cards/tables and sticky mobile controls.
- **Installable web app:** web manifest, Apple touch icon and network-first service worker. API responses are never cached by the service worker.
- **Copilot planning context:** the read-only Copilot can now query accounts, goals and net-worth/planning summary through deterministic tools.

## Existing capabilities

- Financial overview and live credit-card balances.
- Per-card dashboards and statement-cycle engine.
- Manual purchases, payments, refunds, fees, interest and cash advances.
- Liverpool-specific 27th close / 27th following-month payment rule.
- MSI schedules and interest-bearing debt simulations.
- Card archive/restore without deleting history.
- Recurring-expense baselines and period overrides.
- PDF/TXT statement import and reconciliation.
- Daily/monthly cash-flow forecast.
- Salary and known one-time income scheduling.
- Emergency-fund planning, budgets and scenario simulation.
- Read-only AI Financial Copilot with deterministic finance tools.
- Vercel + Neon production architecture, signed private session, audit events and state backups.

## Run locally

The production target uses Node.js 24 on Vercel. Local development should preferably use Node.js 24 as well.

From the project root:

```bash
node -v
npm install
npm run build
npm start
```

Then open:

```text
http://localhost:8787
```

The local server uses `public/`, the same UI served by Vercel. Local data remains in `data/user-data.json` and is excluded from Git.

## Production deployment

Production architecture:

```text
iPhone / iPad / browser
        |
      HTTPS
        |
      Vercel
   public/ + api/index.js
        |
        +---- OpenAI API (optional Copilot)
        |
      Neon Postgres
```

v0.8 requires **no new Neon SQL migration** when upgrading an existing v0.7 installation. `app_state` remains the durable aggregate and the v0.8 state migration automatically adds:

- `accounts`
- `goals`
- `goalContributions`
- `uiPreferences`

Existing cards, transactions, imports, Copilot history and preferences remain intact.

Required Vercel variables remain:

```text
DATABASE_URL
APP_PASSWORD
SESSION_SECRET
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_REASONING_EFFORT
APP_ORIGIN
```

## iPhone and iPad

The interface automatically switches to tablet/mobile navigation at 1024px and below. On iPhone/iPad Safari you can install it as a home-screen web app:

1. Open the production URL in Safari.
2. Tap **Share**.
3. Choose **Add to Home Screen**.
4. Launch **Finance OS** from the new icon.

The app honors safe areas around the Dynamic Island/home indicator and can follow the device theme when Theme = System.

## Privacy boundaries

- Never store full card PAN, CVV, banking passwords or online-banking credentials.
- Account records in v0.8 contain only user-defined labels, institution name, type and balance.
- OpenAI credentials stay server-side.
- The Copilot remains read-only.
- The service worker excludes `/api/*` from caching.

## Project structure

```text
core/        deterministic billing, debt, recurring and forecast logic
server/      TypeScript service/repository/Copilot source + compiled production bundle
api/         single Vercel Function entrypoint
production/  Neon state store and authentication
public/      production UI, PWA manifest, service worker and icons
db/          schema and historical migrations
docs/        deployment, upgrade and phase documentation
data/        local runtime data; never commit user-data.json
```

## Tests

Run:

```bash
./test-all.sh
```

The suite compiles both TypeScript projects, runs billing/service/import/forecast/Copilot regressions, exercises the new v0.8 account/goal/planning APIs, performs local HTTP smoke tests, validates JavaScript/config files and verifies the production bundle entrypoints.

See `docs/PHASE_8.md` for the v0.8 implementation and `docs/UPDATE_GITHUB_V08.md` for the safest upgrade procedure when the new ZIP is extracted into a different Windows folder.
