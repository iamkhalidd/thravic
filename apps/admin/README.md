# Thravic Admin

The internal back-office portal for platform owners: user and domain management, subscriptions,
plans, promo codes, data retention, system settings, and the admin audit log.

This is an **independent project**. It has its own `package.json`, `package-lock.json`, and
`node_modules`, and does not depend on any file outside this directory.

## Requirements

- Node.js 18+
- A running Thravic API (see `../server`)

## Setup

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev                          # http://localhost:3002
```

Sign in with an account whose `role` is `admin` or `super_admin`. The login screen calls
`GET /api/admin/dashboard/stats` to confirm the account actually holds admin privileges, and refuses
entry with a `403` otherwise.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Next.js dev server on port 3002 |
| `npm run build` | Production build |
| `npm start` | Serve the production build on port 3002 |
| `npm run lint` | `next lint` |

## Configuration

`NEXT_PUBLIC_API_URL` points at the Thravic API and defaults to `http://localhost:3001`
(see `next.config.js`). It is inlined into the client bundle at build time, so changing it requires
a rebuild.

The API's `CORS_ORIGIN` must include this app's origin (`http://localhost:3002` in development).

## Talking to the API

All requests go through `src/lib/api.ts`. Tokens are stored in `localStorage` under `admin_token`
and `admin_refresh_token` — deliberately different keys from the customer frontend so the two apps
never collide if they share a browser origin.

## Deployment

Deployed to Vercel with the project root directory set to `apps/admin`. `vercel.json` pins
`npm ci` as the install command so Vercel uses this project's committed lockfile.

## Layout

```text
src/
├── app/
│   ├── (dashboard)/   # audit, domains, events, plans, promos, retention,
│   │                  # settings, subscriptions, system, users
│   └── login/         # Admin login
├── lib/               # API client
└── styles/            # Global CSS and design tokens
```
