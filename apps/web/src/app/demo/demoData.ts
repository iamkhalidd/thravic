// Sample data for the public demo. Shapes follow what the real dashboard
// pages read from the API, so the demo views can use the same components.

/** The last `days` days as YYYY-MM-DD, oldest first (UTC). */
function lastDays(days: number): string[] {
    const today = new Date();
    return Array.from({ length: days }, (_, i) => {
        const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (days - 1 - i)));
        return d.toISOString().slice(0, 10);
    });
}

const VISITORS = [450, 520, 380, 620, 890, 780, 950, 870, 1020, 1100, 980, 820, 860, 1180];
const PAGEVIEWS = [1200, 1350, 980, 1580, 2100, 1890, 2340, 2150, 2480, 2670, 2350, 1980, 2100, 2890];
const PREVIOUS = [410, 470, 400, 520, 700, 690, 760, 720, 800, 870, 830, 760, 740, 880];

export const trafficData = lastDays(14).map((date, i) => ({
    date,
    visitors: VISITORS[i],
    pageviews: PAGEVIEWS[i],
    sessions: Math.round(VISITORS[i] * 1.3),
    previousVisitors: PREVIOUS[i],
}));

export const metrics = {
    uniqueVisitors: 8730,
    pageviews: 28450,
    sessions: 11240,
    bounceRate: 38.2,
    avgSessionDuration: 204,
};

/** Percentage change against the previous period, per metric. */
export const metricChange = {
    uniqueVisitors: 11.2,
    pageviews: 17.6,
    sessions: 9.4,
    bounceRate: -10.1,
    avgSessionDuration: 14.6,
};

export const channels = [
    { label: 'Direct', value: 3240 },
    { label: 'Organic search', value: 2180 },
    { label: 'Social', value: 1560 },
    { label: 'Referral', value: 890 },
    { label: 'Paid', value: 520 },
    { label: 'Email', value: 340 },
];

export const referrers = [
    { label: 'producthunt.com', value: 380 },
    { label: 'github.com', value: 310 },
    { label: 'news.ycombinator.com', value: 120 },
    { label: 'dev.to', value: 80 },
];

export const social = [
    { label: 'Twitter / X', value: 890 },
    { label: 'Facebook', value: 670 },
    { label: 'LinkedIn', value: 420 },
];

export const search = [
    { label: 'Google', value: 2180 },
    { label: 'Bing', value: 180 },
    { label: 'DuckDuckGo', value: 64 },
];

export const topPages = [
    { path: '/', views: 8450 },
    { path: '/pricing', views: 3200 },
    { path: '/features', views: 2180 },
    { path: '/blog/getting-started', views: 1560 },
    { path: '/contact', views: 980 },
    { path: '/about', views: 720 },
    { path: '/docs', views: 540 },
    { path: '/blog/analytics-tips', views: 380 },
];

export const realtime = {
    activeVisitors: 27,
    pageviewsLast30Min: 184,
    activePages: [
        { path: '/', count: 12 },
        { path: '/pricing', count: 8 },
        { path: '/features', count: 4 },
        { path: '/docs', count: 2 },
        { path: '/blog/getting-started', count: 1 },
    ],
};

export const campaigns = [
    { campaign: 'product-hunt-launch', source: 'producthunt', medium: 'referral', sessions: 4620, visitors: 3800, pageviews: 9900 },
    { campaign: 'blog-seo', source: 'google', medium: 'organic', sessions: 2540, visitors: 2100, pageviews: 6100 },
    { campaign: 'spring-launch', source: 'google', medium: 'cpc', sessions: 1480, visitors: 1250, pageviews: 3300 },
    { campaign: 'twitter-q1', source: 'twitter', medium: 'paid_social', sessions: 1090, visitors: 920, pageviews: 1900 },
    { campaign: 'newsletter-promo', source: 'newsletter', medium: 'email', sessions: 810, visitors: 680, pageviews: 2350 },
    { campaign: 'linkedin-outreach', source: 'linkedin', medium: 'paid_social', sessions: 530, visitors: 450, pageviews: 980 },
];

export const behaviorPages = [
    { path: '/', pageviews: 8450, avgTime: 45, entries: 5200, exits: 1800, bounceRate: 32.1 },
    { path: '/pricing', pageviews: 3200, avgTime: 120, entries: 1200, exits: 980, bounceRate: 28.5 },
    { path: '/features', pageviews: 2180, avgTime: 95, entries: 800, exits: 620, bounceRate: 35.2 },
    { path: '/blog/getting-started', pageviews: 1560, avgTime: 210, entries: 1100, exits: 420, bounceRate: 22.8 },
    { path: '/contact', pageviews: 980, avgTime: 60, entries: 320, exits: 580, bounceRate: 45.3 },
    { path: '/about', pageviews: 720, avgTime: 55, entries: 180, exits: 420, bounceRate: 52.1 },
    { path: '/docs/api-reference', pageviews: 540, avgTime: 180, entries: 220, exits: 150, bounceRate: 18.9 },
    { path: '/blog/analytics-tips', pageviews: 380, avgTime: 195, entries: 280, exits: 120, bounceRate: 20.4 },
];

export const flows = [
    { from: '/', to: '/pricing', count: 1840 },
    { from: '/', to: '/features', count: 1210 },
    { from: '/features', to: '/pricing', count: 760 },
    { from: '/pricing', to: '/register', count: 640 },
    { from: '/blog/getting-started', to: '/', count: 420 },
    { from: '/pricing', to: '/contact', count: 310 },
];

export const entries = [
    { path: '/', count: 5200 },
    { path: '/pricing', count: 1200 },
    { path: '/blog/getting-started', count: 1100 },
    { path: '/features', count: 800 },
];

export const exits = [
    { path: '/', count: 1800 },
    { path: '/pricing', count: 980 },
    { path: '/features', count: 620 },
    { path: '/contact', count: 580 },
];

export const devices = [
    { label: 'Mobile', value: 5680 },
    { label: 'Desktop', value: 2620 },
    { label: 'Tablet', value: 430 },
];

export const browsers = [
    { label: 'Chrome', value: 3950 },
    { label: 'Safari', value: 2860 },
    { label: 'Firefox', value: 1080 },
    { label: 'Edge', value: 620 },
    { label: 'Samsung Internet', value: 220 },
];

export const systems = [
    { label: 'Android', value: 3410 },
    { label: 'iOS', value: 2490 },
    { label: 'Windows', value: 1690 },
    { label: 'macOS', value: 960 },
    { label: 'Linux', value: 180 },
];

export const funnels = [
    { id: 'signup', name: 'Signup to first conversion', stepsCount: 5, description: 'Landing to paid' },
    { id: 'checkout', name: 'Checkout', stepsCount: 3, description: 'Cart to receipt' },
];

export const funnelSteps = [
    { name: 'Landing page', visitors: 5200 },
    { name: 'View pricing', visitors: 3120 },
    { name: 'Start trial', visitors: 1248 },
    { name: 'Complete setup', visitors: 874 },
    { name: 'First conversion', visitors: 524 },
];

export const heatmapPages = [
    { path: '/', clicks: 4210, visitors: 2890 },
    { path: '/pricing', clicks: 1870, visitors: 1240 },
    { path: '/features', clicks: 960, visitors: 820 },
    { path: '/blog/getting-started', clicks: 410, visitors: 390 },
];

/** Click positions as percentages of the whole page. */
export const heatmapPoints = [
    { x: 14, y: 5, count: 120 },
    { x: 82, y: 5, count: 260 },
    { x: 50, y: 22, count: 340 },
    { x: 44, y: 23, count: 180 },
    { x: 26, y: 44, count: 150 },
    { x: 50, y: 44, count: 110 },
    { x: 74, y: 44, count: 90 },
    { x: 50, y: 60, count: 210 },
    { x: 34, y: 72, count: 290 },
    { x: 66, y: 72, count: 120 },
    { x: 50, y: 90, count: 45 },
];

export const scrollDepth = [
    { y: 25, count: 2750 },
    { y: 50, count: 2010 },
    { y: 75, count: 1240 },
    { y: 100, count: 610 },
];

/** startedAt is minutes before now. */
export const recordings = [
    { id: 'r1', url: '/pricing', device: 'mobile', duration: 245, eventsCount: 312, startedAt: -6 },
    { id: 'r2', url: '/', device: 'desktop', duration: 180, eventsCount: 204, startedAt: -14 },
    { id: 'r3', url: '/blog/getting-started', device: 'desktop', duration: 420, eventsCount: 518, startedAt: -23 },
    { id: 'r4', url: '/features', device: 'tablet', duration: 95, eventsCount: 88, startedAt: -37 },
    { id: 'r5', url: '/register', device: 'mobile', duration: 310, eventsCount: 402, startedAt: -52 },
    { id: 'r6', url: '/docs', device: 'desktop', duration: 150, eventsCount: 141, startedAt: -68 },
] as const;

export const insights = [
    { id: 'i1', type: 'funnel', priority: 'high' as const, title: 'Most trial users stop at "Complete setup"', description: '30% of visitors who start a trial do not finish setup, the largest drop in your signup funnel.', recommendation: 'Watch the replays of visitors who left on the setup step and cut the fields they hesitate on.' },
    { id: 'i2', type: 'page', priority: 'high' as const, title: 'Bounce rate up on /pricing', description: 'Bounce rate on /pricing rose to 45% from 28% last week.', recommendation: 'Open the /pricing heatmap: check whether visitors reach the plan buttons on mobile.' },
    { id: 'i3', type: 'opportunity', priority: 'medium' as const, title: 'Product Hunt visitors convert well', description: 'Visitors from producthunt.com reach the trial step twice as often as the site average.', recommendation: 'Link your launch page from your docs and changelog to keep that traffic coming.' },
    { id: 'i4', type: 'technical', priority: 'medium' as const, title: 'Blog pages load slowly on mobile', description: 'Largest contentful paint on /blog pages is 4.2s on mobile, against 2.5s for a good score.', recommendation: 'Compress the hero images and lazy-load anything below the fold.' },
    { id: 'i5', type: 'traffic', priority: 'low' as const, title: 'Mobile is now most of your traffic', description: 'Mobile visitors are 65% of sessions this period, up from 52%.', recommendation: 'Review your conversion steps on a phone first.' },
];

/** Predicted pageviews; offset is days after today. */
export const forecast = [
    { offset: 1, predicted: 2960 },
    { offset: 2, predicted: 3010 },
    { offset: 3, predicted: 2880 },
    { offset: 4, predicted: 3120 },
    { offset: 5, predicted: 3190 },
];

export const errors = [
    { message: "TypeError: Cannot read properties of undefined (reading 'price')", source: 'checkout.js', count: 124, lastSeen: 'Today' },
    { message: 'ReferenceError: gtag is not defined', source: 'vendor.js', count: 89, lastSeen: 'Yesterday' },
    { message: 'NetworkError when attempting to fetch resource.', source: '/api/plans', count: 45, lastSeen: '2 days ago' },
];

export const vitals = [
    { key: 'lcp', label: 'Largest contentful paint (LCP)', value: '2.1s', status: 'Good', good: '2.5s' },
    { key: 'fcp', label: 'First contentful paint (FCP)', value: '1.3s', status: 'Good', good: '1.8s' },
    { key: 'cls', label: 'Cumulative layout shift (CLS)', value: '0.150', status: 'Needs work', good: '0.1' },
    { key: 'fid', label: 'First input delay (FID)', value: '42ms', status: 'Good', good: '100ms' },
    { key: 'ttfb', label: 'Time to first byte (TTFB)', value: '620ms', status: 'Good', good: '800ms' },
] as const;

export const perfByPage = [
    { path: '/', lcp: '1.8s', fcp: '1.1s', status: 'Good', count: 1240 },
    { path: '/pricing', lcp: '2.2s', fcp: '1.4s', status: 'Good', count: 610 },
    { path: '/blog/getting-started', lcp: '4.2s', fcp: '2.4s', status: 'Poor', count: 380 },
    { path: '/features', lcp: '2.9s', fcp: '1.6s', status: 'Needs work', count: 290 },
];

export const forms = [
    { name: 'Start trial', id: 'signup', action: '/register', method: 'POST', fields: 3, submissions: 1248 },
    { name: 'Newsletter', id: 'newsletter', action: '/api/subscribe', method: 'POST', fields: 1, submissions: 412 },
    { name: 'Contact', id: 'contact-form', action: '/api/contact', method: 'POST', fields: 4, submissions: 96 },
];

export const rageClicks = [
    { element: 'button.plan-toggle', path: '/pricing', count: 64, avg: 4.2 },
    { element: 'img.hero-screenshot', path: '/', count: 38, avg: 3.6 },
    { element: 'a#docs-link', path: '/features', count: 17, avg: 3.1 },
];
