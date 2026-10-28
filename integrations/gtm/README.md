# Thravic Analytics — Google Tag Manager template

A tag template for the Google Tag Manager Community Template Gallery. Once it is
in the gallery, anyone with GTM can add Thravic without touching code: search
"Thravic" under Templates, add the tag, paste the tracking ID, fire it on
**Initialization - All Pages**, publish.

## What it does

It loads the same tracker the dashboard's snippet loads:

```html
<script async src="https://api.thravic.com/tf.js" data-tracking-id="TF-1A2B3C4D"></script>
```

A GTM template can't put `data-tracking-id` on the script it adds, so the
template sets `window.__TF_ID__` instead. The tracker reads that first, so the
result is the same.

| Field | Goes to | Notes |
| --- | --- | --- |
| Tracking ID | `window.__TF_ID__` | Required. Must look like `TF-` + 8 hex characters. |
| Track clicks / scroll depth / form submissions / JavaScript errors / page speed | `window.__TF_CONFIG__.trackClicks`, `trackScrolls`, `trackForms`, `trackErrors`, `trackPerformance` | "Thravic default", On or Off. |
| Session recordings | `trackRecordings` | |
| Respect Do Not Track | `respectDoNotTrack` | |
| Wait for consent | `requireConsent` | Then the site's banner calls `TF('consent', 'granted')`. |
| Characters of click text to keep | `clickTextMaxLength` | Whole number; empty means default. |

"Thravic default" leaves the option out, so the dashboard's setting applies.
Anything chosen in the tag wins over the dashboard (that is how the tracker
treats `window.__TF_CONFIG__`). Options the page already put in
`window.__TF_CONFIG__` are kept.

Permissions it asks for, and nothing else:

- **Injects scripts**: only `https://api.thravic.com/tf.js`.
- **Accesses global variables**: read/write `__TF_ID__` and `__TF_CONFIG__`.

If the tracker's options change in `apps/api/tracker/src/index.ts` (the
`TFConfig` interface), update the fields here too.

## The icon

`___INFO___` → `brand.thumbnail` is the Thravic app icon (the site's
`/apple-icon`, 180×180) as a base64 PNG. Replace it there if the logo changes.

## Test it in GTM first

1. In GTM go to **Templates → Tag Templates → New**, open the ⋮ menu and choose
   **Import**, then pick `template.tpl`.
2. Open the **Tests** tab and click **Run Tests**. All five should pass.
3. Save, add a tag from the template on a test container, use **Preview** on a
   site, and check the dashboard's Verify Installation.

## Submitting to the Community Template Gallery (you do this)

Google only accepts a template from its **own public GitHub repository** with
these files at the root, on the main branch: `template.tpl`, `metadata.yaml`
and `LICENSE` (Apache 2.0, already filled in). One template per repository.

1. Create a new public GitHub repository, for example `thravic/gtm-template`,
   and turn on **Issues** (Google files review problems there) and email
   notifications.
2. Copy everything in this folder (`template.tpl`, `metadata.yaml`, `LICENSE`,
   `README.md`) to the root of that repository. Commit and push.
3. In GTM, open the template in the Template Editor, go to the **Info** tab and
   tick the box agreeing to the Community Template Gallery Terms of Service. If
   that changes the file, export it again and replace `template.tpl`.
4. Copy the full SHA of the commit that holds the final `template.tpl`
   (`git rev-parse HEAD`) into `metadata.yaml` in place of
   `REPLACE_WITH_COMMIT_SHA`. Commit and push again.
5. Go to [tagmanager.google.com/gallery](https://tagmanager.google.com/gallery),
   sign in with a GitHub account that can see the repository, open the ⋮ menu,
   choose **Submit Template**, paste the repository URL and click **Submit**.

Google reviews it; questions arrive as GitHub issues on the repository.

### Releasing an update

Change `template.tpl` and commit. Then add a new entry at the **top** of
`versions` in `metadata.yaml` with that commit's SHA and a line of
`changeNotes`, and commit. Updates usually show in the gallery within 2–3 days,
and GTM users get a prompt to update.

Keep this folder and the gallery repository in step: make changes here first,
then copy them over.

Reference: [Submit a template to the Community Template Gallery](https://developers.google.com/tag-platform/tag-manager/templates/gallery).
