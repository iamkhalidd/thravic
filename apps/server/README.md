# TrackFlow Server API

## Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/me` - Get current user & preferences
- `PATCH /api/auth/me` - Update preferences

## Domains
- `POST /api/domains` - Create domain
- `GET /api/domains` - List domains
- `GET /api/domains/:id` - Get domain details
- `PUT /api/domains/:id` - Update domain
- `DELETE /api/domains/:id` - Delete domain
- `GET /api/domains/:id/verify` - Verify DNS

## Collection (Tracking)
- `POST /api/collect/:trackingId` - Send event/session data
- `POST /api/collect/:trackingId/batch` - Batch events

## Analytics
- `GET /api/analytics/:domainId/overview` - Stats (visitors, pageviews, bounce, duration)
- `GET /api/analytics/:domainId/realtime` - Active users
- `GET /api/analytics/:domainId/sources` - Traffic sources
- `GET /api/analytics/:domainId/referrers` - Top referrers
- `GET /api/analytics/:domainId/pages` - Top pages
- `GET /api/analytics/:domainId/devices` - Device stats
- `GET /api/analytics/:domainId/geo` - Country/City stats

## Features
- **Team**: `GET /api/teams/:domainId/members`, `POST /invite`, `DELETE /:userId`
- **Export**: `GET /api/export/:domainId?type=sessions` (CSV)
- **Webhooks**: `GET /api/webhooks/:domainId`, `POST /`, `DELETE /:id`
- **Experiments**: `GET /api/experiments/:domainId`, `POST /`, `PUT /:id`

## Setup
1. `npm install`
2. `npm run dev` (starts server on 3001)
