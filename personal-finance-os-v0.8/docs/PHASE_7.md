# Phase 7 — Production / Cloud

Version: **0.7.0**

Phase 7 converts the local prototype into a private, stateless cloud application designed for Vercel + Neon.

## What changed

### Durable persistence
Local `data/user-data.json` is no longer the production source of truth. The production handler uses Neon Postgres through `@neondatabase/serverless`.

To preserve exact v0.6 behavior while minimizing migration risk, the complete application aggregate is stored in `app_state.state` as JSONB. Every write increments an optimistic-lock revision and writes an `audit_events` record. This avoids lost updates if two browser requests attempt to mutate the same state concurrently.

The normalized schema from previous phases remains in the repository for future analytics and progressive migration.

### Automatic backups
Before importing a statement or committing a reconciliation, the current aggregate is copied into `state_backups`. Manual backups are also available through the authenticated admin API.

### Private authentication
Production access is protected by a single-user login suitable for this private personal-finance deployment:

- password exists only as a server-side environment variable;
- successful login issues a signed HttpOnly cookie;
- Secure + SameSite=Strict cookie attributes;
- 30-day session expiration;
- authenticated API by default;
- optional strict `APP_ORIGIN` validation on writes.

The application never stores the login password or OpenAI API key in the browser.

### Serverless API
`api/index.js` is a Vercel Node.js function. It creates a request-scoped FinanceService backed by durable Postgres state. Static files are served from `public/`.

### Cloud PDF extraction
The local build used the `pdftotext` executable. Production uses Mozilla PDF.js (`pdfjs-dist`) so statement import works inside the Vercel runtime without an operating-system binary.

### Security headers
`vercel.json` configures:

- Content Security Policy
- X-Frame-Options DENY
- X-Content-Type-Options nosniff
- no-referrer policy
- restrictive Permissions-Policy
- same-origin COOP/CORP

### Auditability
Every state mutation has an event type and resulting revision. The API exposes authenticated audit inspection and manual snapshot creation.

## Production architecture

```
Browser
  │ HTTPS + HttpOnly session
  ▼
Vercel CDN / static public/
  │
  ├── /login.html
  └── /api/* → Vercel Node Function
                    │
                    ├── Finance Engine (deterministic)
                    ├── OpenAI Responses API (server-side key)
                    ├── PDF.js statement extraction
                    └── Neon Postgres
                           ├── app_state
                           ├── audit_events
                           └── state_backups
```

## Known production limitations

1. The deployment is single-user by design. Multi-user auth/RLS is deliberately not added until there is an actual requirement.
2. Vercel request body limits mean statement PDFs should be kept small. The production handler currently rejects files above 4 MB before parsing.
3. Liverpool's encoded statement may still need a text export or a future OCR adapter if PDF.js cannot recover meaningful glyphs.
4. The JSONB aggregate is intentional for v0.7 migration safety. The normalized schema can be adopted incrementally after the cloud version has been validated with real data.
5. Authentication is adequate for a private single-user app, but a future shared version should move to a managed identity provider and row-level security.

## Phase 7 acceptance criteria

- [x] cloud-safe stateless API
- [x] durable Postgres persistence adapter
- [x] optimistic concurrency control
- [x] audit log
- [x] state backups
- [x] private login
- [x] server-side OpenAI key
- [x] cloud PDF parser
- [x] production security headers
- [x] Vercel configuration
- [x] deployment runbook
- [ ] live Neon project connection
- [ ] live Vercel deployment

The final two items require the user's cloud resources to be linked/configured. The package itself is production-ready for those steps.
