/**
 * Install instructions written for an AI coding agent (Cursor, Claude Code,
 * Copilot, Lovable, v0, ...). The site owner copies one prompt; the agent
 * works out the framework and adds the tag the right way for it.
 */

export interface TrackerTag {
    /** The tracker URL, e.g. https://api.example.com/tf.js */
    src: string;
    trackingId: string;
    /** Origin of the API, for Content-Security-Policy and verification. */
    origin: string;
}

/** Pulls src and data-tracking-id out of the snippet the API returns. */
export function parseTrackerTag(script: string): TrackerTag | null {
    const src = script.match(/src="([^"]+)"/)?.[1];
    const trackingId = script.match(/data-tracking-id="([^"]+)"/)?.[1];
    if (!src || !trackingId) return null;
    let origin = '';
    try {
        origin = new URL(src).origin;
    } catch {
        /* relative src: leave the origin out */
    }
    return { src, trackingId, origin };
}

/** The tag as a single line of HTML. */
export function scriptTag({ src, trackingId }: TrackerTag): string {
    return `<script async src="${src}" data-tracking-id="${trackingId}"></script>`;
}

/** next/script form, for the App Router root layout. */
export function nextScriptTag({ src, trackingId }: TrackerTag): string {
    return `<Script src="${src}" data-tracking-id="${trackingId}" strategy="afterInteractive" />`;
}

export function buildInstallPrompt(tag: TrackerTag): string {
    const html = scriptTag(tag);
    const origin = tag.origin || 'the tracker’s origin';

    return `Add the Thravic analytics script to this website so it loads on every page.

## The script

${html}

Keep the src and data-tracking-id exactly as written, and keep \`async\`.

## How to add it

First find out how this project renders its pages, then use the matching method. Put it in the one shared place every page uses (root layout, base template, index.html), not in individual pages.

- Plain HTML site: inside <head> of every HTML page, or of the shared header/template if there is one.
- Next.js App Router (app/layout.tsx or .jsx): \`import Script from 'next/script'\` and add
  ${nextScriptTag(tag)}
  inside <body> of the root layout.
- Next.js Pages Router: add the plain <script> tag inside <Head> in pages/_document (create it if missing).
- React with Vite or Create React App, Vue with Vite, Angular, Svelte: index.html (src/index.html for Angular), inside <head>.
- Nuxt: in nuxt.config, app.head.script: [{ src: '${tag.src}', async: true, 'data-tracking-id': '${tag.trackingId}' }].
- SvelteKit: src/app.html, inside <head>.
- Astro: the shared layout component's <head>.
- Remix / React Router framework mode: the root route's <head> (app/root.tsx).
- Gatsby: gatsby-ssr with setHeadComponents.
- WordPress theme: hook into wp_head from the theme's functions.php (or header.php before </head>).
- Shopify theme: layout/theme.liquid, before </head>.
- Anything else: the template rendered on every page, inside <head>.

## Rules

- Add it exactly once. In single-page apps it belongs in the root layout or index.html, never in a component that renders on each route.
- Load it from the URL above. Do not download, copy, bundle or self-host tf.js — it is updated on our side.
- If the site sends a Content-Security-Policy (meta tag, server headers, next.config, vercel.json, netlify.toml, _headers, etc.), allow ${origin} in script-src and connect-src. Change nothing else in it.
- Do not add other analytics, cookies, cookie banners or consent code, and do not change unrelated files.
- Session recording, if the site owner turns it on in Thravic, asks visitors for consent itself and never records what they type. Do not add code for it. If pages show personal data on screen (account numbers, addresses, health or payment details), list those elements for me so I can decide whether to hide them with class "tf-mask" (hide text) or "tf-block" (leave out entirely) — don't add the classes yourself.

## When you're done

1. Tell me which file(s) you changed and show the diff.
2. Tell me how to check it after deploying: open the site with the browser's DevTools → Network tab, reload, and confirm tf.js loads (status 200) and a request goes to ${origin}/api/collect/${tag.trackingId}/batch within a few seconds.
3. Remind me to click "Verify installation" in the Thravic dashboard.`;
}
