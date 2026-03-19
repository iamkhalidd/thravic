# Comprehensive Product Requirements Document (PRD)

**Product Name:** TrackFlow / Thravic Analytics  
**Document Status:** Approved & Active
**Last Updated:** March 2026

---

## 1. Executive Summary
**TrackFlow** is an advanced, privacy-conscious Traffic Intelligence & Behavior Analytics SaaS. It aims to replace traditional, clunky analytics platforms by combining standard quantitative web analytics (pageviews, bounce rates, audience demographics) with deep qualitative behavioral insights (click/scroll heatmaps, full session recordings, rage click detection, form analytics, and conversion funnels). 

The platform is designed to be easily embeddable via a single JavaScript snippet, highly performant, and seamlessly monetizable through a multi-tier subscription system.

---

## 2. User Personas

1. **The Product Manager / UX Designer:** Needs to understand exactly *how* users are interacting with their web application. Relies heavily on visual behavior tools (Session Recordings, Heatmaps, Rage Clicks, Web Vitals) to optimize UX.
2. **The Growth Marketer:** Needs to understand *where* traffic is coming from and *how* it converts. Relies heavily on UTM parameter tracking, Conversion Funnel builders, and A/B Experiments.
3. **The Agency Owner:** Manages marketing and analytics for multiple client websites. Needs multi-domain support, generous data limits, and Role-Based Access Control (RBAC) to invite team members and clients as viewers.
4. **The Platform Administrator (You):** Needs absolute control over the SaaS environment. Requires the ability to impersonate users to debug issues, manage system-wide maintenance toggles, dispatch announcement banners, and audit system events.

---

## 3. Detailed Features & Epics (Functional Requirements)

### Epic 1: Client-Side Telemetry (The Tracking Script)
*The core engine responsible for securely capturing user interactions without degrading host website performance.*

*   **Page & Session Tracking:** 
    *   Automatically generate and manage unique `visitor_id` (LocalStorage) and `session_id` (SessionStorage) with a 30-minute expiry window.
    *   Capture Referrers, standard pageviews, and all UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`).
*   **Behavioral Tracking:**
    *   **Clicks:** Record X/Y coordinates of document clicks. Safely capture the clicked HTML element tag, ID, and class. Sanitize or strip text strings to prevent PII leakage.
    *   **Scrolls:** Record scroll depth in 25% increments to build scroll heatmaps safely via throttled listeners.
    *   **Rage Clicks:** Detect when a user clicks the exact same DOM node 3 or more times within an 800ms window, triggering a custom "rage_click" event.
*   **Session Recordings (Opt-in):**
    *   Capture DOM mutations, throttled mouse movements, window resizes, and scrolling.
    *   *Privacy Protocol:* **Never** capture exact keystrokes. Only log input value lengths for visual representation without PII leakage.
    *   Automatically terminate recordings after 10 minutes (600,000ms) to conserve storage.
*   **Performance & Error Tracking:**
    *   Capture Core Web Vitals leveraging the PerformanceObserver API (TTFB, FCP, LCP, FID, CLS).
    *   Listen to `window.onerror` and `unhandledrejection` to capture JavaScript crashes, line numbers, and truncated stack traces.
*   **Form Analytics:**
    *   Capture form `submit` events, logging the form action path, method, and field count to identify drop-off points.
*   **Network & Delivery Mechanism:**
    *   Batch events locally until queue size reaches 10 or flush interval triggers (every 5 seconds).
    *   Utilize `navigator.sendBeacon()` for non-blocking payload delivery, falling back to `fetch(keepalive)` if unavailable.
    *   **Consent Mode:** If `requireConsent` is true, pause all telemetry until `TF('consent', 'granted')` is invoked. Respects browser `Do-Not-Track` headers.

### Epic 2: Web Dashboard & Analytics UI
*The Next.js-powered frontend where users interpret their collected data.*

*   **Realtime Overview:** View active visitors on the site at any given second.
*   **Audience Dashboard:** Breakdowns of visitors by Device (Mobile/Tablet/Desktop), Browser, Operating System, and Geo-location (Country / Region / City).
*   **Acquisition Dashboard:** Traffic sources broken down by direct, organic search, social, referral, ads, and email. Full parsing of UTMs.
*   **Behavioral Dashboard:**
    *   **Heatmaps:** Visual overlay on top of the customer's URLs indicating hot/cold map areas based on X/Y click events and aggregated scroll depths.
    *   **Recordings:** A video-like player UI rendering the sequence of `mousemove`, `click`, `scroll`, `input`, and `resize` events on a timeline.
*   **Conversion Funnels:** An interface allowing users to define a sequence of steps (e.g., Pageview(/pricing) -> Event(click_buy) -> Pageview(/success)) and visualize the drop-off percentage at each stage.
*   **A/B Experiments:** Allow users to define traffic allocation (e.g., 50/50 split) across different UI variants and track matching conversion events automatically.

### Epic 3: Multi-Domain & Team Management
*Infrastructure allowing users to scale their usage across properties.*

*   **Domain Registration:** Users can register multiple domains. The system generates a unique `tracking_id` for the embed snippet.
*   **Domain Verification:** An endpoint (`GET /api/domains/:id/verify`) to verify DNS ownership or script presence.
*   **Team Collaboration (`domain_members`):**
    *   Role-Based Access Control allowing users to invite others via email to a specific domain.
    *   Roles: `admin` (can change settings), `viewer` (read-only analytics).
*   **Webhooks:** Users can register external URLs to receive real-time HTTP POST payloads when specific events occur (e.g., Rage Clicks, Conversions).
*   **Data Export:** Secure CSV generation for raw tracking sessions and events.

### Epic 4: Monetization, Billing & Usage
*How the SaaS generates revenue and enforces system limits.*

*   **Subscription Tiers (Integrated via Paystack):**
    *   *Free / Hobby:* 5,000 monthly events limit, 1 Domain limit, 30 days data retention.
    *   *Pro (₦45,000/mo):* 100,000 events limit, 3 Domains, 365 days retention. Unlocks Heatmaps, Recordings, Funnels, and Experiments.
    *   *Agency (₦125,000/mo):* 500,000 events limit, 20 Domains, 730 days retention.
*   **Metering (`usage_logs`):** Background jobs track total events ingested per domain per month. If a user exceeds limits, telemetry is paused or throttled until upgraded.
*   **Promo Codes & Discounts:** Admin feature to generate flat or percentage discount codes, restricting them by max usage or specific plans. Tracks redemptions cleanly against the `payment_history` ledger.

### Epic 5: SaaS Administration & Operations
*Platform management mechanics ensuring stability and elite customer support.*

*   **System Settings Engine:** Runtime key-value configuration stored in the database (`system_settings`) to avoid hard server restarts.
    *   Toggles: `maintenance.enabled`, `registration.enabled`, `tracking.enabled`.
    *   Global Feature Flags mapping (e.g., easily toggling AI Insights on/off globally).
*   **User Impersonation:** Super Admins can securely generate a temporary session token representing any user UUID to replicate bugs without requiring their password.
*   **Announcement Banners:** A unified system to push broadcast messages/alerts to the User Dashboard globally.
*   **Admin Audit Logging:** Comprehensive tracking of every action taken by an administrator (action, target_type, target_id, IP address) for strict security compliance.

---

## 4. Technical Architecture & Stack

*   **Frontend Client:** Next.js (App Router), TypeScript, Tailwind CSS, generating static/server-rendered dashboards.
*   **Tracking Client:** Vanilla TypeScript payload (`tracking-script/src/index.ts`) compiled into a highly compressed, zero-dependency `.js` file served via CDN.
*   **Backend API:** Node.js + Express.js. RESTful endpoints handling heavy telemetry ingestion via `/api/collect`.
*   **Primary Database:** PostgreSQL (Neon Serverless). Standard relational models utilizing `UUID v4` primary keys and intensive indexing on domains, timestamps, and event types for high-performance read queries.
*   **Caching & Rate Limiting:** Redis caches session data, handles rate-limiting payloads to prevent DDoS, and buffers fast writes.
*   **3rd Party Services:**
    *   Paystack for sub-billing.
    *   Resend + Nodemailer for transactional email delivery.

---

## 5. Core Data Model (PostgreSQL Schema Highlights)

The architecture is deliberately relational with some denormalization for read speed.

*   `users`: Core account data, roles (`user`, `admin`, `super_admin`), Paystack references, and OAuth integrations.
*   `domains`: Websites being tracked. Links to a unique `tracking_id`.
*   `domain_members`: Resolves M:N relationships for team invites and RBAC.
*   `visitors`: Unique device/browser fingerprints attached to a domain.
*   `sessions`: 30-minute logical groupings of activity. Denormalizes UTMs, Geo-location, and Device properties directly onto the row.
*   `events`: The core high-volume table. Explicitly typed (`pageview`, `click`, `scroll`, `form`, `custom`). Contains a `JSONB` data column for flexible payloads (e.g., Performance Metrics).
*   `heatmap_data`: Aggregated coordinate data (x, y, counts) to avoid calculating heatmaps from raw events in real-time.
*   `session_recordings`: Stores the JSON blob of sequential mutation/mouse payloads.
*   `funnels` & `funnel_steps`: Defines user-created conversion flows.
*   `experiments`: Controls A/B testing definitions and traffic variants.
*   `system_settings`: Key-Value runtime configuration for Admins.
*   `data_retention_policies`: Automated CRON targets to prune stale data based on subscription limits (30, 365, or 730 days).

---

## 6. Non-Functional Requirements (NFRs)

*   **Data Privacy & Compliance (GDPR/CCPA):**
    *   No raw keystrokes are submitted to the server from forms or inputs.
    *   Consent Mode fully pauses tracking.
    *   No invasive device fingerprinting; reliant on first-party `localStorage`.
*   **Performance (Zero Impact):**
    *   The tracking script must execute in `< 50ms`.
    *   Payload processing must drop events over limits rapidly to avoid memory leaks.
*   **Data Retention & Cleanup:**
    *   Background CRON jobs must meticulously prune `events` and `session_recordings` data that exceed the plan's `retention_days` limit to manage PostgreSQL cloud costs.
*   **Security:**
    *   Strong Rate Limiting on API endpoints.
    *   Zod schema validation on absolutely every incoming payload.
    *   Helmet for secure HTTP headers.

---

## 7. System Architecture & Project Structure

The TrackFlow platform is built as a **Turborepo/Monorepo**. It cleanly separates responsibilities across **four distinct modules**: a customer-facing frontend (`web`), an internal SaaS management portal (`admin`), the core backend API (`server`), and the installable client telemetry library (`tracking-script`).

### 7.1. High-Level Architecture Roles
1. **`apps/web` (The Customer Dashboard):** Written in Next.js 14 and TailwindCSS. This is where end-users log in to view their tracking data (heatmaps, funnels, reports) and manage their active subscriptions.
2. **`apps/admin` (The Back-Office Portal):** A completely isolated Next.js app exclusively for platform owners. Used to manage global settings, perform security audits, create promo codes, and impersonate users for support.
3. **`apps/server` (The Core Engine):** A high-performance Node.js/Express API. Handles thousands of concurrent telemetry events (`/api/collect`), processes payments, enforces API validation (Zod), and manages PostgreSQL transactions.
4. **`packages/tracking-script` (The Telemetry Snippet):** A highly optimized, dependency-free TypeScript library that compiles down to a lightweight tracking snippet (`thravic.js`). Customers embed this on their own websites to capture user interactions.

### 7.2. Comprehensive Structural Tree

```text
tracking/
├── apps/
│   ├── admin/           # Next.js Admin Portal
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (dashboard)/
│   │   │   │   │   ├── audit/         # Audit logs
│   │   │   │   │   ├── domains/       # Domain mgmt
│   │   │   │   │   ├── plans/         # Sub plans
│   │   │   │   │   ├── promos/        # Promo codes
│   │   │   │   │   ├── retention/     # Data cleanup
│   │   │   │   │   ├── settings/      # System config
│   │   │   │   │   ├── subscriptions/ # Subscriptions
│   │   │   │   │   └── users/         # User directory
│   │   │   │   └── login/         # Admin login
│   │   └── package.json
│   │
│   ├── server/          # Node.js/Express API
│   │   ├── src/
│   │   │   ├── config/      # Env configs
│   │   │   ├── db/          # PostgreSQL schemas
│   │   │   ├── jobs/        # Cron jobs
│   │   │   ├── middleware/  # Auth & Security
│   │   │   ├── routes/      # API Endpoints
│   │   │   │   ├── admin/     # SuperAdmin routes
│   │   │   │   ├── collect.ts # Telemetry ingest
│   │   │   │   ├── analytics.ts # Dashboard data
│   │   │   │   └── payments.ts  # Webhooks logic
│   │   │   ├── services/    # Business logic
│   │   │   └── validators/  # Zod schemas
│   │   └── package.json
│   │
│   └── web/             # Next.js Dashboard App
│       ├── src/
│       │   ├── app/
│       │   │   ├── dashboard/   # Authenticated UI
│       │   │   │   ├── behavior/  # Visual analytics
│       │   │   │   ├── traffic/   # Quant. analytics
│       │   │   │   ├── funnels/   # Form tracking UI
│       │   │   │   └── settings/  # Billing mgmt
│       │   │   ├── auth/        # Login/OAuth
│       │   │   └── landing-pages/
│       │   ├── components/  # React UI (Charts)
│       │   ├── hooks/       # Custom React hooks
│       │   └── contexts/    # React State
│       └── package.json
│
├── packages/
│   └── tracking-script/ # Telemetry script
│       ├── src/
│       │   └── index.ts   # Core tracker logic
│       └── package.json   # Rollup build config
│
├── docker-compose.yml   # Dev orchestration
├── package.json         # Workspace root
└── PRD.md               # Product Requirements
```

### 7.3. Micro-Service Interaction Flow
1. **Trigger:** A visitor loads a webpage and triggers an event on a customer's website.
2. **Buffer:** The `packages/tracking-script` (`thravic.js`) catches the event and buffers it locally in the browser to save network requests.
3. **Transmit:** The script safely transmits batched payloads via `navigator.sendBeacon` to the API (`apps/server/src/routes/collect.ts`).
4. **Ingest:** The Node.js server validates the JSON payload globally (`src/validators/collect.ts`), authenticates the API key, caches session state in Redis, and asynchronously writes events securely to PostgreSQL (`src/db`).
5. **Analyze:** The customer logs into `apps/web`. The Next.js dashboard requests aggregated metrics from `apps/server/src/routes/analytics.ts` and renders charts/heatmaps.
6. **Administrate:** The Platform Owner (You) logs into `apps/admin` which uses `apps/server/src/routes/admin/` to monitor system-wide cluster health, manage user billing limits, and toggle global capabilities.
```
