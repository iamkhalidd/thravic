# Thravic Web

The customer-facing Thravic dashboard: a Next.js 14 App Router application where customers view
their traffic, behavior, funnel, heatmap, and session-recording analytics and manage their
subscription.

This is an **independent project**. It has its own `package.json`, `package-lock.json`, and
`node_modules`, and does not depend on any file outside this directory.

## Requirements

- Node.js 18+
- A running Thravic API (see `../server`)

## Setup

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev                          # http://localhost:3000
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Next.js dev server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | `next lint` |
| `npm test` | Vitest (add `-- --run` for a single non-watch pass) |

## Configuration

`NEXT_PUBLIC_API_URL` points at the Thravic API and defaults to `http://localhost:3001`
(see `next.config.js`). It is inlined into the client bundle at build time, so changing it requires
a rebuild.

## Talking to the API

All requests go through `src/lib/api.ts`, which attaches the bearer token, transparently refreshes
it on a `401`, and clears tokens on refresh failure.

Auth tokens are stored in `localStorage` under `accessToken` and `refreshToken`. These keys
intentionally differ from the admin portal's (`admin_token` / `admin_refresh_token`) so the two apps
never collide if they share a browser origin.

## Docker

`output: 'standalone'` is enabled in `next.config.js`, so the image ships only the self-contained
server bundle. Vercel ignores that option, meaning the same config serves both targets.

```powershell
docker build -t thravic-web .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://localhost:3001 thravic-web
```

## Layout

```text
src/
├── app/          # Routes (marketing pages, auth, /dashboard)
├── components/   # Shared UI (charts, tables, banners)
├── contexts/     # React state (domain selection, toasts)
├── hooks/        # Custom React hooks
├── lib/          # API client
├── styles/       # Global CSS and design tokens
├── tests/        # Vitest setup
└── types/        # API contract types
```
