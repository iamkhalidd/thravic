import type { Domain, Platform } from '@/types';

/** Whether a property is a mobile app rather than a website. */
export function isApp(domain?: Pick<Domain, 'platform'> | null): boolean {
    return !!domain && (domain.platform ?? 'web') !== 'web';
}

export const PLATFORM_LABELS: Record<Platform, string> = {
    web: 'Website',
    ios: 'iOS app',
    android: 'Android app',
    cross: 'iOS and Android app',
};

/**
 * Pages built on what only a browser sends: referrers and UTM tags, JavaScript
 * errors, Web Vitals, forms, clicks and screen recordings. Hidden from an app's
 * sidebar, and an app opened on one is sent to the overview.
 */
const WEB_ONLY = [
    '/dashboard/traffic/sources',
    '/dashboard/traffic/campaigns',
    '/dashboard/errors',
    '/dashboard/performance',
    '/dashboard/forms',
    '/dashboard/rage-clicks',
    '/dashboard/heatmaps',
    '/dashboard/sessions',
];

/** Pages with nothing to show for a website. */
const APP_ONLY = ['/dashboard/behavior/versions'];

const under = (pathname: string, prefixes: string[]) =>
    prefixes.some(p => pathname === p || pathname.startsWith(`${p}/`));

/** Whether `pathname` has anything to show for this property. */
export function pathFits(pathname: string, app: boolean): boolean {
    return !under(pathname, app ? WEB_ONLY : APP_ONLY);
}
