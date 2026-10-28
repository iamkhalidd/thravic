import { buildInstallPrompt, nextScriptTag, parseTrackerTag } from './installPrompt';

// Install steps for the website script, per platform. One source for the
// dashboard's install panel and the public guides under /docs/<platform>.

export type InstallPlatform =
    | 'html' | 'wordpress' | 'shopify' | 'webflow' | 'nextjs' | 'ai'
    | 'wix' | 'squarespace' | 'framer' | 'ghost' | 'carrd' | 'bubble' | 'blogger' | 'joomla' | 'drupal' | 'gtm';

/** Plugin zip, attached to the latest GitHub release until it is on WordPress.org. */
export const WORDPRESS_PLUGIN = {
    href: 'https://github.com/iamkhalidd/thravic/releases/latest/download/thravic.zip',
    label: 'Download the WordPress plugin',
};

export const INSTALL_PLATFORMS: { id: InstallPlatform; label: string; title: string; summary: string }[] = [
    { id: 'wordpress', label: 'WordPress', title: 'Install on WordPress', summary: 'Install the Thravic plugin and paste your tracking ID.' },
    { id: 'shopify', label: 'Shopify', title: 'Install on Shopify', summary: 'Add the tag to your theme’s layout file.' },
    { id: 'wix', label: 'Wix', title: 'Install on Wix', summary: 'Add the tag in Settings → Custom Code.' },
    { id: 'squarespace', label: 'Squarespace', title: 'Install on Squarespace', summary: 'Paste the tag into Code Injection.' },
    { id: 'webflow', label: 'Webflow', title: 'Install on Webflow', summary: 'Add the tag in Site settings → Custom code.' },
    { id: 'framer', label: 'Framer', title: 'Install on Framer', summary: 'Add the tag in Site Settings → Code.' },
    { id: 'ghost', label: 'Ghost', title: 'Install on Ghost', summary: 'Paste the tag into Code injection.' },
    { id: 'carrd', label: 'Carrd', title: 'Install on Carrd', summary: 'Add a hidden Embed element in the head.' },
    { id: 'bubble', label: 'Bubble', title: 'Install on Bubble', summary: 'Paste the tag into Settings → SEO / metatags.' },
    { id: 'blogger', label: 'Blogger', title: 'Install on Blogger', summary: 'Add the tag to your theme’s HTML.' },
    { id: 'joomla', label: 'Joomla', title: 'Install on Joomla', summary: 'Add the tag to your site template.' },
    { id: 'drupal', label: 'Drupal', title: 'Install on Drupal', summary: 'Add a few lines with the Asset Injector module.' },
    { id: 'gtm', label: 'Tag Manager', title: 'Install with Google Tag Manager', summary: 'Add a Custom HTML tag that fires on every page.' },
    { id: 'nextjs', label: 'Next.js', title: 'Install on Next.js', summary: 'Use next/script in your root layout.' },
    { id: 'ai', label: 'AI agent', title: 'Install with an AI coding agent', summary: 'Give Cursor, Claude Code, Lovable or v0 one prompt.' },
    { id: 'html', label: 'Other / HTML', title: 'Install on any HTML site', summary: 'Paste one tag into your site’s head.' },
];

export interface PlatformInstructions {
    snippet: string;
    steps: string[];
    /** Plan limits or other things to know first, shown above the steps. */
    note?: string;
    /** A file to download first, shown as a button above the steps. */
    download?: { href: string; label: string };
}

/** The tag as plain JavaScript, for places that take code but not HTML (Drupal's Asset Injector). */
export function loaderScript(script: string): string {
    const tag = parseTrackerTag(script);
    if (!tag) return script;
    return `window.__TF_ID__ = '${tag.trackingId}';
(function (d) {
    var s = d.createElement('script');
    s.async = true;
    s.src = '${tag.src}';
    s.setAttribute('data-tracking-id', '${tag.trackingId}');
    d.head.appendChild(s);
})(document);`;
}

/**
 * Snippet and steps for a platform. `verifyStep` is the last step: the dashboard
 * points at its Verify button, the public guides at the dashboard.
 */
export function getPlatformInstructions(platform: InstallPlatform, script: string, verifyStep: string): PlatformInstructions {
    switch (platform) {
        case 'html':
            return {
                snippet: script,
                steps: [
                    'Copy the snippet above.',
                    "Open your website's HTML file (usually index.html).",
                    'Paste it just before the closing </head> tag.',
                    'Save and re-deploy your site.',
                    verifyStep,
                ],
            };
        case 'wordpress': {
            const tag = parseTrackerTag(script);
            return {
                // The plugin only needs the ID; it prints the full tag itself.
                snippet: tag ? tag.trackingId : script,
                download: WORDPRESS_PLUGIN,
                steps: [
                    'Download the Thravic plugin (thravic.zip) with the button above. It is coming soon to the WordPress.org plugin directory.',
                    'In your WordPress admin go to Plugins → Add New → Upload Plugin, choose thravic.zip, then click Install Now and Activate.',
                    'Go to Settings → Thravic.',
                    'Paste your tracking ID (shown above) into the Tracking ID box and click Save Changes. The page should say "Tracker is active".',
                    'Your own visits as an admin or editor are not counted, so check it in a private window.',
                    'Can’t install plugins? Copy the snippet from the HTML tab and paste it in the Header box of a plugin like "WPCode" instead.',
                    verifyStep,
                ],
            };
        }
        case 'shopify':
            return {
                snippet: script,
                note: 'A one-click Shopify app is on the way. Until then, add the snippet to your theme as below.',
                steps: [
                    'Copy the snippet above.',
                    'In your Shopify admin go to Online Store → Themes. Click the "..." menu next to your current theme and choose Edit code.',
                    'Open Layout → theme.liquid.',
                    'Paste the snippet just before the closing </head> tag, then click Save.',
                    verifyStep,
                ],
            };
        case 'wix':
            return {
                snippet: script,
                note: 'Wix only runs custom code on a paid plan with your own domain connected — not on a free wixsite.com address. The site must also be published.',
                steps: [
                    'Copy the snippet above.',
                    'In your Wix dashboard go to Settings, then Custom Code (under Development & integrations).',
                    'Click + Add Custom Code, paste the snippet and name it "Thravic".',
                    'Under Add Code to Pages choose All pages and "Load code once". Under Place Code in choose Head. Click Apply.',
                    verifyStep,
                ],
            };
        case 'squarespace':
            return {
                snippet: script,
                note: 'Code Injection needs a Core, Plus or Advanced plan (or an older Business or Commerce plan).',
                steps: [
                    'Copy the snippet above.',
                    'In Squarespace open Pages, scroll down to Website Tools and click Code Injection.',
                    'Paste the snippet into the Header box.',
                    'Click Save.',
                    verifyStep,
                ],
            };
        case 'webflow':
            return {
                snippet: script,
                note: 'Custom code needs a paid Site plan (or a paid Core, Growth, Agency or Freelancer Workspace).',
                steps: [
                    'Copy the snippet above.',
                    'Open your site in Webflow and go to Site settings → Custom code.',
                    'Paste the snippet in the Head code box and click Save.',
                    'Publish your site. The code only goes live after you publish.',
                    verifyStep,
                ],
            };
        case 'framer':
            return {
                snippet: script,
                steps: [
                    'Copy the snippet above.',
                    'In your Framer project open Site Settings → Code and add new custom code.',
                    'Set Placement to "Start of <head>" and Pages to All, then paste the snippet and save.',
                    'Publish your site. Visits only count on the published site, not in Preview.',
                    verifyStep,
                ],
            };
        case 'ghost':
            return {
                snippet: script,
                steps: [
                    'Copy the snippet above.',
                    'In Ghost Admin open Settings (the gear icon) and find Code injection.',
                    'Click Open, paste the snippet into the Site header box and click Save.',
                    verifyStep,
                ],
            };
        case 'carrd':
            return {
                snippet: script,
                note: 'Embeds need Carrd Pro Standard or higher. Pro Lite doesn’t include them.',
                steps: [
                    'Copy the snippet above.',
                    'In the Carrd builder click Add Element → Embed.',
                    'Set Type to Code and paste the snippet in Code. Set Style to Hidden and choose Head.',
                    'Publish your site. The embed shows nothing in the builder — that’s normal.',
                    verifyStep,
                ],
            };
        case 'bubble':
            return {
                snippet: script,
                note: 'Bubble only runs header scripts on a paid plan. On the free plan the box is there but ignored.',
                steps: [
                    'Copy the snippet above.',
                    'In the Bubble editor open the Settings tab, then SEO / metatags.',
                    'Paste the snippet into "Script/meta tags in header" (under Advanced settings).',
                    'Deploy your app to Live.',
                    verifyStep,
                ],
            };
        case 'blogger':
            // Blogger themes are XML, where an attribute needs a value: `async` alone breaks the save.
            return {
                snippet: script.replace(/<script async /g, '<script async="async" '),
                steps: [
                    'Copy the snippet above. It is written slightly differently because Blogger is strict about HTML.',
                    'In Blogger open Theme. Next to "My theme", open the menu (the three dots or arrow) and choose Edit HTML.',
                    'Click inside the code, press Ctrl+F (Cmd+F on a Mac), search for </head> and paste the snippet just above it.',
                    'Click the save icon.',
                    verifyStep,
                ],
            };
        case 'joomla':
            return {
                snippet: script,
                note: 'A template update can undo this edit. Check the tag is still there after updating Joomla, or use a child template.',
                steps: [
                    'Copy the snippet above.',
                    'In Joomla Administrator go to System → Site Templates.',
                    'Open your template’s Details and Files (for example "Cassiopeia Details and Files") and click index.php.',
                    'Paste the snippet just before the closing </head> tag and click Save & Close.',
                    verifyStep,
                ],
            };
        case 'drupal':
            return {
                snippet: loaderScript(script),
                note: 'Drupal has no box for header code, so this uses the free Asset Injector module. The code above is the same tag written as JavaScript.',
                steps: [
                    'Install the Asset Injector module (drupal.org/project/asset_injector) and turn it on under Extend.',
                    'Go to Configuration → Development → Asset Injector → JS Injector and click Add JS Injector.',
                    'Name it "Thravic", paste the code above into the code box and click Save.',
                    verifyStep,
                ],
            };
        case 'gtm':
            return {
                snippet: script,
                note: 'Your site must already have the Google Tag Manager container code on it.',
                steps: [
                    'Copy the snippet above.',
                    'In Google Tag Manager open your container, go to Tags and click New.',
                    'Click Tag Configuration → Custom HTML and paste the snippet. Name the tag "Thravic".',
                    'Click Triggering, choose Initialization - All Pages, and Save.',
                    'Click Submit, then Publish.',
                    verifyStep,
                ],
            };
        case 'nextjs': {
            const tag = parseTrackerTag(script);
            return {
                snippet: tag
                    ? `// app/layout.tsx (App Router)
import Script from 'next/script';

// inside <body> of the root layout:
${nextScriptTag(tag)}`
                    : script,
                steps: [
                    'App Router: add the <Script> above inside <body> of app/layout.tsx, once.',
                    'Pages Router: paste the plain HTML snippet (HTML tab) inside <Head> in pages/_document.tsx instead.',
                    'Commit and deploy your changes.',
                    verifyStep,
                ],
            };
        }
        case 'ai': {
            const tag = parseTrackerTag(script);
            return {
                snippet: tag
                    ? buildInstallPrompt(tag)
                    : `Add this analytics script to this website, once, inside <head> of the shared layout so it loads on every page. Keep it exactly as written.\n\n${script}`,
                steps: [
                    'Copy the prompt above.',
                    'Paste it into your AI coding agent (Cursor, Claude Code, GitHub Copilot, Windsurf, Lovable, Bolt, v0, …) with your website project open.',
                    'Review the change it makes — it should touch one shared file (plus your security policy if you have one).',
                    `Deploy, then ${verifyStep.charAt(0).toLowerCase()}${verifyStep.slice(1)}`,
                ],
            };
        }
    }
}
