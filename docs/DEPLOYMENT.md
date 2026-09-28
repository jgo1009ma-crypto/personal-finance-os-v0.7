# Deployment runbook — Vercel + Neon

## 1. Prerequisites

- Vercel account
- Neon project/database
- OpenAI API key (optional, required only for AI Copilot)
- Node.js 24 recommended for local production parity

## 2. Neon

Create or select a Neon project and copy its pooled connection string.

Apply:

```sql
-- db/migrations/005_phase7_production.sql
```

The production API also creates the three operational tables defensively if they do not exist, but applying the migration explicitly is preferable because infrastructure should not rely on a first web request to discover its schema.

## 3. Vercel environment variables

Configure these for **Production** and, if desired, Preview:

```text
DATABASE_URL=postgresql://...
APP_PASSWORD=<long random password>
SESSION_SECRET=<at least 32 random bytes>
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.6-terra
OPENAI_REASONING_EFFORT=medium
APP_ORIGIN=https://your-production-domain
```

`APP_ORIGIN` is optional. If set, it must exactly match the browser Origin for write requests. Do not set the production URL for preview deployments unless previews use that same origin.

### Generate SESSION_SECRET

Node:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## 4. Deploy

Deploy the repository root. Vercel detects:

- `public/` as static assets
- `api/index.js` as the serverless API
- `vercel.json` for rewrites, security headers and function limits

Set the Vercel project Node.js runtime to **24.x**.

## 5. Smoke test

Unauthenticated health:

```text
GET /api/v1/health
```

Expected:

```json
{
  "ok": true,
  "version": "0.8.1",
  "storage": "neon-postgres"
}
```

Then open `/login.html`, authenticate, and verify:

1. Overview loads.
2. Create a harmless test movement and refresh the page.
3. Open a second browser/device and verify the movement persists.
4. Run a financial simulation.
5. Ask Copilot a read-only question.
6. Import a small statement PDF and review it without committing.
7. Confirm `/api/v1/admin/audit` records the mutation after login.

## 6. Migration from local v0.6 data

v0.7 initializes from the seed dataset when the database has no state. If the local installation contains movements, overrides, imports or Copilot conversations that must be preserved, use the migration script described in `docs/LOCAL_TO_CLOUD.md` before making production edits.

## 7. Operational discipline

- Keep `DATABASE_URL`, `SESSION_SECRET`, `APP_PASSWORD`, and `OPENAI_API_KEY` only in Vercel environment variables.
- Never commit `.env`.
- Create a manual backup before large reconciliations.
- Neon point-in-time restore / branching can be used as an additional disaster-recovery layer.
- Review audit entries if a balance changes unexpectedly.
- Do not expose the application publicly without authentication.


## 8. Upgrading an existing v0.7 deployment to v0.8

No new Neon DDL is required. Push the v0.8 repository to the same GitHub branch linked to Vercel. On first authenticated load, the aggregate state is migrated in memory to state version 8 with empty `accounts`, `goals`, `goalContributions` and default `uiPreferences` when those fields are absent. Existing data is preserved.

See `docs/UPDATE_GITHUB_V08.md` when the v0.8 ZIP is extracted into a different Windows folder from the current Git checkout.
