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
.\.venv\Scripts\python.exe -m alembic upgrade head   # create/update the schema

.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 3001
```

Port **3001** is what the web and admin frontends expect (`NEXT_PUBLIC_API_URL`
defaults to `http://localhost:3001`).

`JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGIN` and
`FRONTEND_URL` **must keep the values the service had before the FastAPI cutover** so
previously issued tokens remain valid.

The API needs Postgres + Redis; point `DATABASE_URL` / `REDIS_URL` at your own
instances (the deployed service uses Neon + Upstash). The schema is **not** created
automatically — run `alembic upgrade head` (above) once Postgres is reachable. The
app boots without Postgres or Redis: the database logs a warning and Redis degrades
to no-op caching.

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
bodies, unconfigured OAuth guards), so `conftest.py` seeds safe development
defaults for `NODE_ENV`, `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGIN`,
`FRONTEND_URL` and the OAuth client IDs before settings load — a production
`.env` cannot leak in. Explicitly exported environment variables still win, so
the suite can be pointed at a specific database when needed.

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

**Alembic is the single source of truth for the schema.** The app no longer
creates tables on boot — `alembic upgrade head` is a required step (see
"Running").

Each revision under `alembic/versions/` is **self-contained**: its SQL is
embedded inline and run via `alembic_support.py`. A shipped revision must never
change — add a new one instead. There are still no SQLAlchemy models, so
`--autogenerate` is off (`target_metadata = None`).

| Revision | Contents |
| --- | --- |
| `0001_baseline` | The full application schema (frozen at adoption) |
| `0002_paystack_rename` | The Stripe→Paystack column rename |

`alembic/env.py` builds the connection from the app's `DATABASE_URL` and reuses
`app.db`'s DSN/TLS handling, so migrations connect exactly like the runtime pool.

### Adopting on an existing database

A database that already has the schema (for example the current production
database) should be **stamped** instead of re-running the baseline:

```powershell
.\.venv\Scripts\python.exe -m alembic stamp head
```

A database that predates the Paystack rename should instead be baselined at the
baseline revision and then upgraded, so that migration actually runs (it is
idempotent, so this is safe either way):

```powershell
.\.venv\Scripts\python.exe -m alembic stamp 0001_baseline
.\.venv\Scripts\python.exe -m alembic upgrade head
```

### Applying migrations

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head    # apply pending migrations
.\.venv\Scripts\python.exe -m alembic current         # show the applied revision
.\.venv\Scripts\python.exe -m alembic history         # show the full chain
```

Offline SQL generation (`--sql`) prints the baseline schema, which contains `═`
box drawing characters; on Windows redirecting that to a file needs UTF-8:

```powershell
$env:PYTHONUTF8="1"; .\.venv\Scripts\python.exe -m alembic upgrade head --sql
```

### Adding a migration

Generate a revision, then paste the SQL into it and run it with
`run_sql_script(...)` from `upgrade()` / `downgrade()`:

```powershell
.\.venv\Scripts\python.exe -m alembic revision -m "short description"
```

See `alembic/versions/0002_paystack_rename.py` for the pattern.

SQLAlchemy models for CRUD-heavy endpoints are still **not** used — raw SQL
remains for analytics and aggregations.

## Layout

```text
apps/api/
├── alembic.ini             # Alembic config (URL built by env.py from settings)
├── alembic/                # Alembic env + revisions (SQL-migration mode)
├── alembic_support.py      # run_sql_script(): executes a revision's SQL
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
