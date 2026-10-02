# Thravic API (FastAPI)

The Thravic backend: a FastAPI (Python) service backed by PostgreSQL and Redis.
It is the replacement for the original Express backend, which was deleted after a
byte-for-byte port verification.

## Status

**Fully ported — cutover complete.** Every Express route has a FastAPI equivalent,
verified before the cutover by a request-diffing harness that fired an identical
request at both backends (same database, same Redis) and compared status, JSON,
and selected headers:

**237 matched, 0 diverged, 11 skipped** — the 11 skips were write-mutating specs
that required explicit opt-in.

| Area | Status |
| --- | --- |
| Config, logging, security validation, plan definitions | Done |
| Postgres layer (asyncpg pool + `query` / `query_one` / `execute` / `transaction`) | Done |
| Redis client + JSON cache (graceful degradation) | Done |
| JS-compatible JSON serialization | Done |
| Middleware: error handling, security headers, CORS, rate limiting | Done |
| Middleware: auth, admin auth, feature gate, settings gates, blocklist | Done |
| Services: settings, users, refresh-token store, email | Done |
| Auth: register, login, refresh, logout, password reset, OAuth (GitHub/Google) | Done |
| Analytics, sources, heatmaps, insights, custom-events, announcements, contact | Done |
| Domains, funnels, experiments, webhooks, teams, export, recordings | Done |
| Collect (hot path), payments (Paystack), admin (`/api/admin/*`) | Done |
| Tracker script serving (`/tf.js`, `/v.js`) — built from `tracker/`, see below | Done |

## Running

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

Copy-Item .env.example .env      # then edit values

.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 3001
```

Port **3001** is what the web and admin frontends expect (`NEXT_PUBLIC_API_URL`
defaults to `http://localhost:3001`).

`JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGIN` and
`FRONTEND_URL` **must keep the values the service had before the FastAPI cutover** so
previously issued tokens remain valid.

Infrastructure only (Postgres + Redis):

```powershell
docker compose up -d                                        # infra only
docker compose --profile docker up -d --build               # also run the API in a container
```

The app boots without Postgres or Redis: the database logs a warning and Redis
degrades to no-op caching.

## Rebuilding the tracker

The script served at `/tf.js` and `/v.js` is a **committed build artifact**:
`tracker/src/index.ts` (a dependency-free TypeScript project) is bundled by
esbuild into `app/static/tracker.js`. Nothing builds it during deploy, so after
editing the source you must rebuild and commit:

```powershell
cd tracker
npm install       # first time only
npm run build     # rewrites ../app/static/tracker.js
```

`npm run typecheck` checks the source without emitting, and `npm run dev`
rebuilds on change. Never hand-edit `app/static/tracker.js` — CI rebuilds and
fails if the committed file does not match the source.

At serve time, `routers/tracker.py` reads the file once and replaces its single
`${apiUrl}` placeholder with `SERVER_URL` (falling back to `API_URL`), so the
tracker posts to whichever API URL the deployment is configured with.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Covering serialization, the error/status contracts, CORS (including the open
`/api/collect` exemption), the CSP/`CORS_ORIGIN` linkage, the settings gates, the
redirect allowlist, the OAuth guards, and the tracker delivery contract
(headers plus placeholder interpolation on `/tf.js` and `/v.js`). No database
or Redis required.

The suite asserts development behaviour (localhost CORS origins, unmasked error
bodies, unconfigured OAuth guards), so it must not load a production `.env`.
Override `NODE_ENV`, `CORS_ORIGIN`, `FRONTEND_URL`, and the OAuth client IDs
with their development values for the test run.

## Parity rules

These exist because the frontends were built against the original responses;
breaking one silently breaks a client.

1. **Always return `jsjson(...)` from route handlers, never a bare dict.**
   FastAPI's `jsonable_encoder` would coerce `Decimal` to `float` and reformat
   datetimes, drifting from what the original backend produced.

2. **JSON must match JS semantics.** `JSON.stringify` emits compact output, raw
   UTF-8, and ISO datetimes with milliseconds and a `Z`. `jsjson` handles this; see
   `app/json_response.py`.

3. **Type codecs in `app/db.py` are load-bearing.** asyncpg would return JSONB as a
   *string* and `int8`/`numeric` as native types, whereas node-postgres parses JSONB
   and returns bigint/numeric as strings. The four codecs registered in
   `_init_connection` reproduce node-postgres. If a comparison fails on a
   numeric-looking field, look there first.

4. **`SimpleError` vs `AppError`.** The original middleware answered directly with
   `{error}` (no `code`), while the centralized handler adds a `code`. `SimpleError`
   and `PayloadError` reproduce the former, `AppError` the latter.

5. **Don't "fix" the settings-gate logic.** `registration_gate` and `tracking_gate`
   use `enabled is not False`, which *closes* registration when the setting row is
   missing. That is existing behaviour; `schema.sql` seeds those rows to `true`,
   which is why the normal path stays open.

## Schema and migrations

`sql/schema.sql` is the database schema and is applied on boot, exactly as the
previous backend did.

`sql/migrations/migrate_paystack.sql` holds the Stripe→Paystack rename migration
from the old repo. Apply it to any database that has not been through that rename.

Alembic and SQLAlchemy are deliberately **not** used yet. Planned sequence:

1. **Now** — raw SQL + `schema.sql` on boot.
2. **Next** — adopt Alembic in SQL-migration mode and `alembic stamp head` to
   baseline the existing database without re-running anything.
   `sql/migrations/migrate_paystack.sql` is a good first real migration.
3. **New features after that** — add SQLAlchemy for CRUD-heavy endpoints while
   keeping raw SQL for analytics and aggregations.

## Layout

```text
apps/api/
├── sql/schema.sql          # database schema, applied on boot
├── sql/migrations/         # SQL migrations (adopt through Alembic)
├── tracker/                # tracker source (esbuild → app/static/tracker.js)
├── app/
│   ├── main.py             # app wiring, middleware order, lifespan
│   ├── config.py           # settings (env names match the old backend exactly)
│   ├── db.py               # asyncpg pool + type codecs + query helpers
│   ├── cache.py            # JSON cache helpers
│   ├── redis_client.py     # connection lifecycle
│   ├── json_response.py    # jsjson() — JS-compatible serialization
│   ├── js_compat.py        # JS-semantics helpers (parseInt, Date.toString, …)
│   ├── errors.py           # AppError / SimpleError / PayloadError
│   ├── security.py         # fail-fast secret validation
│   ├── plans.py            # PLAN_FEATURES, PLAN_LIMITS
│   ├── logging.py          # structured logger
│   ├── static/tracker.js   # esbuild output of tracker/src/index.ts — committed,
│   │                       # served at /tf.js and /v.js; do not hand-edit
│   ├── middleware/         # cors, security_headers, error_handler, rate_limit,
│   │                       # auth, admin_auth, feature_gate, settings_gate,
│   │                       # blocklist_gate, redirect_guard
│   ├── routers/            # one module per route group (admin/ has its own package)
│   ├── schemas/            # Pydantic request models
│   └── services/           # users, settings, token store, email, geo, …
└── tests/
    └── test_*.py           # serialization, smoke, redirect guard, OAuth
```
