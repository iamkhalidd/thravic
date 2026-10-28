# Thravic for Shopify

This folder is the Thravic Shopify app. A store owner installs it, types their
Thravic tracking ID once, and gets:

- **Page tracking on every page** of their store (a theme "app embed" that loads
  `https://api.thravic.com/tf.js`, the same script as the dashboard snippet).
- **Shop events** from Shopify's own checkout (a "web pixel"):
  - `add_to_cart` when someone adds a product to the cart
  - `checkout_started` when someone starts checkout
  - `purchase` when an order is placed, with the order value, currency, number
    of items and order number

These events show in the Thravic dashboard under custom events. They use the
same visitor and session as the page tracker, so a purchase joins up with the
visit that led to it.

## What is in here

| Path | What it is |
| --- | --- |
| `shopify.app.toml` | The app's settings: name, permissions, URLs, privacy webhooks |
| `extensions/thravic-theme/` | The app embed that adds the tracking script to the store |
| `extensions/thravic-pixel/` | The web pixel that sends cart, checkout and purchase events |
| `tests/pixel.test.mjs` | Tests for the pixel (`npm test`) |

Two parts live in the Thravic API (`apps/api`), because they must run on a server:

- `https://api.thravic.com/shopify/app` — the page the store owner sees inside
  the Shopify admin, where they type their tracking ID (`app/static/shopify/`).
- `https://api.thravic.com/api/shopify/webhooks` — the three privacy (GDPR)
  webhooks every App Store app must have (`app/routers/shopify.py`).

The app never stores a Shopify access token, and never collects names, emails,
phone numbers or addresses.

## Set it up (one time)

### 1. Make a Shopify Partner account

Go to <https://www.shopify.com/partners> and sign up. It is free.

### 2. Create the app

1. In the Partner dashboard (or the Shopify Dev Dashboard), open **Apps** and
   choose **Create app**, then **Create app manually**. Name it **Thravic**.
2. Open the app's **Settings** (or **Client credentials**). Copy the
   **Client ID** and the **Client secret**.
3. Open `shopify.app.toml` in this folder and replace
   `REPLACE_WITH_YOUR_CLIENT_ID` with the Client ID.

### 3. Tell the Thravic API about the app

In Render, open the API service, go to **Environment**, and add:

| Name | Value |
| --- | --- |
| `SHOPIFY_CLIENT_ID` | the Client ID |
| `SHOPIFY_CLIENT_SECRET` | the Client secret (keep it private) |

Save and let the API redeploy. Until these are set, the app page says
"not set up" and the privacy webhooks answer 401.

### 4. Install the tools

You need Node.js 20 or newer. In this folder run:

```bash
npm install
```

## Try it on a test store

1. In the Partner dashboard, open **Stores** and create a **development store**.
2. In this folder run:

   ```bash
   npm run dev
   ```

   (This is `shopify app dev`.) It asks you to log in to your Partner account
   and pick the app and the development store, then gives you a link to
   install the app on that store.
3. Install it. The Thravic page opens in the Shopify admin.
4. Copy your tracking ID from the Thravic dashboard (it looks like
   `TF-1A2B3C4D`), paste it in, and press **Save**.
5. Press **Turn on in theme**. The theme editor opens with the Thravic embed
   ready; press **Save** there.
6. Visit the store, add something to the cart and place a test order. The
   visit shows in Thravic right away, and `add_to_cart`, `checkout_started`
   and `purchase` show under custom events.

## Release it

When it works on the test store, run:

```bash
npm run deploy
```

(This is `shopify app deploy`.) It uploads the app settings and both
extensions as a new version. Stores that have the app get it automatically.

## Put it on the Shopify App Store

In the Partner dashboard open the app, then **Distribution**, choose
**Shopify App Store**, and fill in the listing. You will need:

- **Privacy policy link:** `https://thravic.com/privacy`
- **Privacy (GDPR) webhooks:** already done. `shopify.app.toml` points
  `customers/data_request`, `customers/redact` and `shop/redact` at the
  Thravic API, which checks Shopify's signature and replies. Thravic keeps no
  Shopify customer data, so there is nothing to send or delete.
- **App icon:** 1200 × 1200 pixels, PNG or JPG.
- **Screenshots:** at least 3, 1600 × 900 pixels. Good ones: the Thravic page
  in the Shopify admin, the theme editor with the embed on, and the Thravic
  dashboard showing visits and purchases.
- **A short description** and a **support email**.
- **Test steps for the reviewer:** a Thravic account they can log in to, and
  a tracking ID they can paste in.

Shopify reviews the app before it goes live. It usually takes a few days.

## How it works (for developers)

- **App embed** (`blocks/thravic-tracker.liquid`): reads the tracking ID from
  the embed's own setting, or else from the app metafield
  `thravic.tracking_id` that the admin page saves. It only adds the script when
  the ID looks right (`TF-` and 8 of `0-9` / `A-F`); in the theme editor it
  shows a warning instead.
- **Web pixel** (`extensions/thravic-pixel/src/`): runs in Shopify's sandbox.
  It reads the tracker's `_tf_vid` / `_tf_sid` cookies (the tracker sets them on
  Shopify stores) so events land on the same visitor and session, and posts to
  `https://api.thravic.com/api/collect/{trackingId}` as `text/plain` so the
  browser does not need a CORS preflight.
- **Admin page**: uses App Bridge's Direct API access
  (`fetch('shopify:admin/api/graphql.json')`) to save the pixel's settings
  (`webPixelCreate` / `webPixelUpdate`) and the metafield, so the Thravic server
  needs no Shopify token.
- **Permissions**: only `write_pixels` and `read_customer_events`.

Run the pixel tests with `npm test`.
