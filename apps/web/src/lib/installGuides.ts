import { buildInstallPrompt, nextScriptTag, parseTrackerTag } from './installPrompt';

// Install steps for the website script, per platform. One source for the
// dashboard's install panel and the public guides under /docs/<platform>.

export type InstallPlatform = 'html' | 'wordpress' | 'shopify' | 'webflow' | 'nextjs' | 'ai';

export const INSTALL_PLATFORMS: { id: InstallPlatform; label: string; title: string; summary: string }[] = [
    { id: 'html', label: 'HTML', title: 'Install on any HTML site', summary: 'Paste one tag into your site’s head.' },
    { id: 'wordpress', label: 'WordPress', title: 'Install on WordPress', summary: 'Add the tag through your theme or a header plugin.' },
    { id: 'shopify', label: 'Shopify', title: 'Install on Shopify', summary: 'Add the tag to your theme’s layout file.' },
    { id: 'webflow', label: 'Webflow', title: 'Install on Webflow', summary: 'Add the tag in Project Settings → Custom Code.' },
    { id: 'nextjs', label: 'Next.js', title: 'Install on Next.js', summary: 'Use next/script in your root layout.' },
    { id: 'ai', label: 'AI agent', title: 'Install with an AI coding agent', summary: 'Give Cursor, Claude Code, Lovable or v0 one prompt.' },
];

/**
 * Snippet and steps for a platform. `verifyStep` is the last step: the dashboard
 * points at its Verify button, the public guides at the dashboard.
 */
export function getPlatformInstructions(platform: InstallPlatform, script: string, verifyStep: string) {
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
        case 'wordpress':
            return {
                snippet: script,
                steps: [
                    'Copy the snippet above.',
                    'In your WordPress admin go to Appearance → Theme File Editor.',
                    'Select header.php from the list on the right.',
                    'Paste the snippet just before the closing </head> tag.',
                    'Click Update File.',
                    'Alternatively, install the "Insert Headers and Footers" plugin and paste the snippet in the Header field.',
                    verifyStep,
                ],
            };
        case 'shopify':
            return {
                snippet: script,
                steps: [
                    'Copy the snippet above.',
                    'In your Shopify admin go to Online Store → Themes.',
                    'Click the "..." menu next to your current theme and choose Edit code.',
                    'Open Layout → theme.liquid.',
                    'Paste the snippet just before the closing </head> tag.',
                    'Click Save.',
                    verifyStep,
                ],
            };
        case 'webflow':
            return {
                snippet: script,
                steps: [
                    'Copy the snippet above.',
                    'Open your Webflow project and go to Project Settings.',
                    'Click the "Custom Code" tab.',
                    'Paste the snippet in the "Head Code" section.',
                    'Click Save Changes, then Publish your site.',
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
