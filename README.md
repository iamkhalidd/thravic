# Thravic — Traffic Intelligence & Behavior Analytics

A privacy-conscious analytics platform for tracking traffic sources, user behavior, conversion
funnels, heatmaps, and session recordings, with AI-powered insights.

---

## Projects

This repository holds **three independent projects**. There is no root `package.json`, no npm
workspaces, and no shared build step. Each project owns its dependencies, lockfile, scripts, and
`.env.example`, and can be installed, tested, built, and deployed entirely on its own.

| Project | Path | Stack | Dev port | Deploys to |
| --- | --- | --- | --- | --- |
| API backend | `apps/api` | FastAPI (Python 3.12), PostgreSQL, Redis | `3001` | Render |
| Customer frontend | `apps/web` | Next.js 14 (App Router), React 18 | `3000` | Vercel, Docker |
| Admin portal | `apps/admin` | Next.js 14 (App Router), React 18 | `3002` | Vercel |

The telemetry snippet that customers embed on their own websites belongs to the API project: its
TypeScript source lives at `apps/api/tracker`, and esbuild bundles it into
`apps/api/app/static/tracker.js` — a **committed artifact** the API serves at `/tf.js` (and
`/v.js`). It keeps its own small toolchain because it ships to third-party sites rather than to this
stack, but nothing needs to build it to deploy the API: the served file is checked in.

### How the projects relate

The projects communicate **only over HTTP/JSON**. Neither frontend imports anything from
`apps/api`, and the backend imports nothing from the frontends. There is no shared types package:
each project keeps its own copy of the contracts it cares about.

That means the only file shared across the whole repository is `.gitignore`, and any project can be
moved to its own repository later without touching the others.

At runtime the API and frontends are joined by two backend environment variables:

- **`CORS_ORIGIN`** — a comma-separated allowlist that must include **both** frontends
  (`http://localhost:3000,http://localhost:3002`). It drives CORS, the `connect-src` CSP policy,
  and the redirect guard.
- **`FRONTEND_URL`** — the customer frontend only. It is used for OAuth callback redirects, the
  Paystack return URL, and links inside transactional emails. The admin portal uses none of those,
  so it is deliberately not listed.

---

## Running locally

Each project runs in its own terminal. No root-level command starts them together.

### Terminal 1 — infrastructure and API

```powershell
cd apps/api
python -m venv .venv                       # first time only
.\.venv\Scripts\python.exe -m pip install -r requirements.txt   # first time only
Copy-Item .env.example .env                # first time only, then edit values
.\.venv\Scripts\python.exe -m alembic upgrade head              # create/update schema
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 3001
```

### Terminal 2 — customer frontend

```powershell
cd apps/web
Copy-Item .env.example .env.local    # first time only
npm install                          # first time only
npm run dev                          # http://localhost:3000
```

### Terminal 3 — admin portal

```powershell
cd apps/admin
Copy-Item .env.example .env.local    # first time only
npm install                          # first time only
npm run dev                          # http://localhost:3002
```

Both frontends already default to `http://localhost:3001` for the API, so the standard local setup
needs no configuration.

### Building the tracking snippet

Only needed after editing `apps/api/tracker/src/index.ts` — the built file is committed.

```powershell
cd apps/api/tracker
npm install       # first time only
npm run build     # emits apps/api/app/static/tracker.js — commit the result
```

`npm run typecheck` checks the source, and `npm run dev` rebuilds on change. API deploys stay pure
Python; no Node step is involved.

---

## Common tasks

| Task | Command |
| --- | --- |
| Run the API | `cd apps/api; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 3001` |
| Test the API (pytest) | `cd apps/api; .\.venv\Scripts\python.exe -m pytest` |
| Lint the API (ruff) | `cd apps/api; .\.venv\Scripts\python.exe -m ruff check app tests` |
| Build the customer frontend | `cd apps/web; npm run build` |
| Test the customer frontend (Vitest) | `cd apps/web; npm test -- --run` |
| Lint a frontend | `cd apps/web; npm run lint` |
| Build the admin portal | `cd apps/admin; npm run build` |

Every Node project uses `npm ci` in CI, which requires the committed `package-lock.json`.

---

## Environment variables

Each project documents its own variables in the `.env.example` beside it:

- `apps/api/.env.example` — the full backend contract
- `apps/web/.env.example` — `NEXT_PUBLIC_API_URL`
- `apps/admin/.env.example` — `NEXT_PUBLIC_API_URL`

`NEXT_PUBLIC_*` values are inlined into the client bundle at build time, so changing them requires a
rebuild or redeploy.

---

## Deployment

| Project | Target | Configuration |
| --- | --- | --- |
| `apps/api` | Render | `render.yaml` (repo root; `rootDir: apps/api`) |
| `apps/web` | Vercel | Set root directory to `apps/web`; `apps/web/vercel.json` |
| `apps/web` | Docker | `apps/web/Dockerfile` |
| `apps/admin` | Vercel | Set root directory to `apps/admin`; `apps/admin/vercel.json` |

When deploying, remember to add the deployed frontend origins to the API's `CORS_ORIGIN`, and keep
`JWT_SECRET`/`JWT_REFRESH_SECRET`/`DATABASE_URL` unchanged from the previous Express service so
issued tokens survive the cutover.

---

## Repository layout

```text
thravic/
├── .github/workflows/ci.yml   # One CI job per project, plus the tracker build
├── .gitignore                 # The only shared file
├── apps/
│   ├── admin/                 # Independent Next.js project
│   ├── api/                   # Independent FastAPI project
│   │   ├── app/static/tracker.js   # Committed tracker build, served at /tf.js
│   │   └── tracker/           # Tracker source (TypeScript, esbuild)
│   └── web/                   # Independent Next.js project
├── PRD.md
└── README.md
```

## License

MIT
