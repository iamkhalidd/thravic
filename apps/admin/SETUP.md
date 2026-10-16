# Admin panel: setup and the steps only you can do

This covers what changed in how the admin panel signs in, and the outside
services (Sentry, an uptime monitor, Cloudflare Access) that need your own
accounts. Do these steps in order after the change is deployed.

## 1. Before you deploy

**The database migration runs by itself.** Migration `0023_admin_security`
adds the authenticator columns and the `daily_domain_stats` table. Render's
start command already runs `alembic upgrade head`. The daily-stats job fills
the last 90 days on its first run, within an hour of the deploy. Until it
does, the overview's event charts look empty.

**Set these on Render (API):**

| Setting | Value |
| --- | --- |
| `ADMIN_PROXY_SECRET` | A long random string. Generate one with `openssl rand -hex 32`. Use the same value on Vercel. |
| `REPORT_TIMEZONE` | `Africa/Lagos` (already in render.yaml) |
| `SENTRY_DSN` | Leave empty until step 3 |

**Set these on Vercel (admin project):**

| Setting | Value |
| --- | --- |
| `API_URL` | The API address, e.g. `https://thravic-api.onrender.com` |
| `ADMIN_PROXY_SECRET` | The same string as on Render |
| `ADMIN_ALLOWED_IPS` | Optional. Your IP addresses, comma separated. Leave empty to skip. |

Set `ADMIN_PROXY_SECRET` on **both** sides in the same sitting. If only the
API has it, the panel can't reach the API until Vercel has it too.

## 2. First sign-in after the deploy

- Everyone signed in to the admin panel is signed out, because sessions now
  live in secure cookies instead of the browser's storage.
- At the first sign-in, each admin sets up an authenticator app, such as
  Google Authenticator, 1Password or Authy. Thravic emails a 6-digit code to
  prove the inbox is yours, then shows a QR code to scan.
- After that, each sign-in asks for the password and then the 6-digit code
  from the app.
- A session lasts 12 hours at most. It ends after 30 minutes without
  activity.

**If someone loses their phone:**

- A super admin can reset their authenticator from Users (the shield icon).
- If the only super admin is locked out, run this on the API server:
  `python -m app.scripts.reset_admin_2fa you@example.com` (on Render: the
  service's Shell tab).

**Warning:** the authenticator keys are encrypted with `JWT_SECRET`. If you
ever change `JWT_SECRET`, every admin has to set up the app again. Reset each
one with the command above.

## 3. Sentry (error alerts)

The API sends its own errors, and crashes in both apps, to Sentry. They go
through the API, so the browser never holds a Sentry key.

1. Create a free account at sentry.io. Create one project of type **FastAPI**
   named `thravic`.
2. Copy the project's DSN. It looks like `https://…@o….ingest.sentry.io/…`.
3. On Render, set `SENTRY_DSN` to the DSN and redeploy.
4. In Sentry, go to Alerts and create a rule: "a new issue is created", then
   "send an email to me". Add a second rule: "an issue is seen more than 50
   times in 1 hour".

Browser crashes appear with the tag `source:browser:web` or
`source:browser:admin`. No cookies, request bodies or user details are sent.

## 4. Uptime monitor

Use UptimeRobot (free) or Better Stack. Create two monitors that check every
5 minutes and email you:

| Monitor | URL | Alert when |
| --- | --- | --- |
| API | `https://<your-api>/health/deep` | Not 200 |
| Website | `https://thravic.com` | Not 200 |

`/health/deep` answers 200 only when the database responds, and 503 when it
does not. That catches "the server is up but can't do anything".

Turn on the setting that alerts only after 2 failed checks in a row. Render's
free tier can be slow on the first request, and this stops false alarms.

## 5. Monthly payment check

On the first working day of each month, open **Revenue**, pick last month and
click **Run check**. It compares Paystack's successful payments with
Thravic's records.

- **Paid in Paystack, missing in Thravic:** the customer may not have their
  plan. The hourly payment job fixes most of these by itself. If one stays,
  grant the plan from Users.
- **In Thravic, not in Paystack:** a refund, a reversal or a test. Check it in
  the Paystack dashboard.

The owner email (info@thravic.com) also gets an alert when:

- a Paystack webhook fails;
- a payment arrives with a wrong signature;
- a payment names an unknown plan;
- a missed payment is recovered;
- a big switch is flipped: Sign-ups, Event collection or Maintenance.

## 6. After the move to thravic.com: Cloudflare Access

Once the admin panel is at `admin.thravic.com` with its DNS on Cloudflare,
put Cloudflare Access in front of it. Then nobody can even load the sign-in
page without first proving their email to Cloudflare.

1. In the Cloudflare dashboard, open **Zero Trust**. The free plan covers up
   to 50 people. Pick a team name.
2. Go to **Access → Applications → Add an application → Self-hosted**.
   - Application domain: `admin.thravic.com`
   - Session duration: 12 hours
3. Add a policy named "Owners":
   - Action: Allow
   - Include: Emails, then your admin email addresses
4. Under **Authentication**, keep "One-time PIN". Cloudflare emails a code to
   the allowed addresses.
5. Make sure the DNS record for `admin` is **Proxied** (orange cloud). Access
   only works on proxied records.
6. Test it in a private window: you should see Cloudflare's sign-in screen
   before the Thravic one.

With Access on, `ADMIN_ALLOWED_IPS` is optional. Keep it empty if your IP
changes often, for example on mobile data.

## 7. Keeping the look in sync

The colours, spacing, type and logos shared by the website and the admin
panel live in `packages/ui`. After changing anything there, run this from the
repo root:

```bash
node scripts/sync-ui.mjs
```

`node scripts/sync-ui.mjs --check` reports any copies that are out of date
without changing them.
