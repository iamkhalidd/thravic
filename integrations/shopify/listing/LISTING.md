# Shopify App Store listing — copy and paste

Open the Partner dashboard → **Apps → Thravic → Distribution → Shopify App Store**,
then **App Store listing**. Each heading below is a field there. Character
limits are Shopify's; every text here fits.

## Basic app information

**App name** (30): `Thravic`

**App icon**: `app-icon-1200.png` (1200 × 1200)

**App category**: Store management → Analytics

## App Store listing content

**App introduction** (100):

> See how shoppers browse, where they drop off, and which visits end in a sale.

**App details** (500):

> Thravic shows what happens on your store between the first page view and the
> order. Watch session replays, see click and scroll heatmaps, and build funnels
> from product page to purchase. Add to cart, checkout started and purchases come
> straight from Shopify's checkout, joined to the visit that led to them, so you
> can see which pages and traffic sources actually sell. Setup takes a minute:
> paste your tracking ID and turn on the Thravic embed. No code, and no customer
> names, emails or addresses are collected.

**Feature list** (up to 8, 80 each):

1. Session replays that show how shoppers move through your store
2. Click and scroll heatmaps for every page
3. Funnels from product page to checkout to purchase
4. Add to cart, checkout and purchase events from Shopify's own checkout
5. Traffic sources and UTM campaigns joined to the sales they bring
6. Rage clicks, form drop-off and JavaScript errors flagged for you
7. AI insights that explain why a number went up or down
8. No code: paste your tracking ID and turn on the theme embed

**Screenshots** (1600 × 900, in this order):

| File | Caption (alt text) |
| --- | --- |
| `screenshot-1-overview.png` | Visitors, sessions, sources and top pages at a glance |
| `screenshot-2-funnels.png` | Funnels show where shoppers drop off before buying |
| `screenshot-3-heatmaps.png` | Click heatmaps show what shoppers tap on each page |
| `screenshot-4-recordings.png` | Replay real visits to see what shoppers did |

**Demo store URL**: leave empty (optional).

**Promotional video**: optional. Skip for now.

## Pricing

Choose **Free to install** and add this in "Additional charges" / notes:

> Free plan: 1 website, 50,000 events a month. Paid plans with more websites,
> events and features are billed on thravic.com.

See "Before you submit" below about billing.

## Contact and policy

- **Privacy policy URL**: `https://thravic.com/privacy`
- **Support email**: `support@thravic.com`
- **Support / FAQ URL**: `https://thravic.com/docs/shopify`
- **Developer website**: `https://thravic.com`

## Search terms (up to 5)

`analytics`, `session replay`, `heatmaps`, `funnels`, `conversion tracking`

## App review: testing instructions

Shopify asks for steps and a login the reviewer can use. Make a Thravic account
for the reviewer first (for example `shopify-review@thravic.com`), add a website
in it, and put its email, password and tracking ID below.

> 1. Install Thravic on your test store. The Thravic page opens in the admin.
> 2. Paste this tracking ID: `TF-________` and click Save. The page says
>    "Connected".
> 3. Click "Turn on in theme". The theme editor opens with the Thravic embed
>    switched on. Click Save.
> 4. Visit the storefront in a private window that is not signed in to the
>    Shopify admin, open a product, add it to the cart and check out with the
>    Bogus Gateway.
> 5. Sign in at https://thravic.com/login with `________` / `________`. The
>    visit shows on the Overview, and add_to_cart, checkout_started and
>    purchase show as custom events.
>
> Note: page views are not recorded for browsers that send Do Not Track.
> Thravic respects that setting.

**Screencast**: Shopify asks for a short video of install and setup. Record the
steps above (2–3 minutes, no sound needed) and upload it to YouTube as
unlisted, or to Google Drive with link sharing on.

## Before you submit

- **Billing.** Shopify's rules ask apps that charge merchants to use Shopify
  Billing. "Free to install" with paid plans billed on your own site is common
  for analytics tools that also work outside Shopify, but the reviewer may ask
  about it. If they do, the answer is that Thravic is a standalone analytics
  service and the Shopify app itself is free.
- **Privacy webhooks** are done (`shopify.app.toml`).
- **Permissions**: only `write_pixels` and `read_customer_events`. Explain them
  as: "To save the tracking ID on the web pixel and receive cart, checkout and
  purchase events."
