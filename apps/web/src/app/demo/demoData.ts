// All mock demo data used across demo views

export const trafficData = [
    { date: '2024-01-01', pageviews: 1200, visitors: 450 },
    { date: '2024-01-02', pageviews: 1350, visitors: 520 },
    { date: '2024-01-03', pageviews: 980, visitors: 380 },
    { date: '2024-01-04', pageviews: 1580, visitors: 620 },
    { date: '2024-01-05', pageviews: 2100, visitors: 890 },
    { date: '2024-01-06', pageviews: 1890, visitors: 780 },
    { date: '2024-01-07', pageviews: 2340, visitors: 950 },
    { date: '2024-01-08', pageviews: 2150, visitors: 870 },
    { date: '2024-01-09', pageviews: 2480, visitors: 1020 },
    { date: '2024-01-10', pageviews: 2670, visitors: 1100 },
    { date: '2024-01-11', pageviews: 2350, visitors: 980 },
    { date: '2024-01-12', pageviews: 1980, visitors: 820 },
    { date: '2024-01-13', pageviews: 2100, visitors: 860 },
    { date: '2024-01-14', pageviews: 2890, visitors: 1180 },
];

export const sourceData = [
    { name: 'Direct', value: 3240, color: 'var(--color-accent-primary)' },
    { name: 'Organic', value: 2180, color: '#E0B50F' },
    { name: 'Social', value: 1560, color: '#34B1AA' },
    { name: 'Referral', value: 890, color: '#3B8FF3' },
    { name: 'Paid', value: 520, color: '#10b981' },
    { name: 'Email', value: 340, color: '#f59e0b' },
];

export const topPages = [
    { path: '/', views: 8450, avgTime: 45, bounceRate: 32.1 },
    { path: '/pricing', views: 3200, avgTime: 120, bounceRate: 28.5 },
    { path: '/features', views: 2180, avgTime: 95, bounceRate: 35.2 },
    { path: '/blog/getting-started', views: 1560, avgTime: 210, bounceRate: 22.8 },
    { path: '/contact', views: 980, avgTime: 60, bounceRate: 45.3 },
    { path: '/about', views: 720, avgTime: 55, bounceRate: 52.1 },
    { path: '/docs', views: 540, avgTime: 180, bounceRate: 18.9 },
    { path: '/blog/analytics-tips', views: 380, avgTime: 195, bounceRate: 20.4 },
];

export const activePages = [
    { path: '/', count: 12 },
    { path: '/pricing', count: 8 },
    { path: '/features', count: 5 },
    { path: '/docs', count: 3 },
    { path: '/blog', count: 2 },
];

export const trafficSources = [
    { source: 'google.com', type: 'Organic', visitors: 2180, pageviews: 5420, bounceRate: 32.1, avgDuration: 185, change: 12.5 },
    { source: 'twitter.com', type: 'Social', visitors: 890, pageviews: 1580, bounceRate: 45.2, avgDuration: 95, change: 28.3 },
    { source: 'facebook.com', type: 'Social', visitors: 670, pageviews: 1120, bounceRate: 52.1, avgDuration: 72, change: -5.2 },
    { source: 'linkedin.com', type: 'Social', visitors: 420, pageviews: 780, bounceRate: 38.5, avgDuration: 142, change: 15.8 },
    { source: 'producthunt.com', type: 'Referral', visitors: 380, pageviews: 620, bounceRate: 28.9, avgDuration: 210, change: 45.2 },
    { source: 'github.com', type: 'Referral', visitors: 310, pageviews: 540, bounceRate: 22.3, avgDuration: 245, change: 8.1 },
    { source: 'bing.com', type: 'Organic', visitors: 180, pageviews: 320, bounceRate: 42.8, avgDuration: 128, change: -2.4 },
    { source: 'newsletter', type: 'Email', visitors: 340, pageviews: 680, bounceRate: 18.5, avgDuration: 290, change: 22.1 },
];

export const campaigns = [
    { name: 'Spring Launch 2024', source: 'google', medium: 'cpc', visitors: 1250, conversions: 89, convRate: 7.1, cost: 2400, revenue: 8900 },
    { name: 'Product Hunt Launch', source: 'producthunt', medium: 'referral', visitors: 3800, conversions: 245, convRate: 6.4, cost: 0, revenue: 24500 },
    { name: 'Twitter Ads Q1', source: 'twitter', medium: 'paid_social', visitors: 920, conversions: 42, convRate: 4.6, cost: 1800, revenue: 4200 },
    { name: 'Blog SEO Content', source: 'google', medium: 'organic', visitors: 2100, conversions: 168, convRate: 8.0, cost: 500, revenue: 16800 },
    { name: 'Newsletter Promo', source: 'email', medium: 'email', visitors: 680, conversions: 95, convRate: 14.0, cost: 150, revenue: 9500 },
    { name: 'LinkedIn Outreach', source: 'linkedin', medium: 'paid_social', visitors: 450, conversions: 28, convRate: 6.2, cost: 1200, revenue: 2800 },
];

export const trendMetrics = [
    { metric: 'Pageviews', current: 28450, previous: 24200, change: 17.6 },
    { metric: 'Unique Visitors', current: 8730, previous: 7850, change: 11.2 },
    { metric: 'Bounce Rate', current: 38.2, previous: 42.5, change: -10.1 },
    { metric: 'Avg. Session Duration', current: 204, previous: 178, change: 14.6 },
    { metric: 'Pages/Session', current: 3.2, previous: 2.8, change: 14.3 },
    { metric: 'New vs Returning', current: 62, previous: 58, change: 6.9 },
];

export const behaviorPages = [
    { path: '/', views: 8450, uniqueViews: 6200, avgTime: 45, entrances: 5200, exits: 1800, bounceRate: 32.1 },
    { path: '/pricing', views: 3200, uniqueViews: 2800, avgTime: 120, entrances: 1200, exits: 980, bounceRate: 28.5 },
    { path: '/features', views: 2180, uniqueViews: 1900, avgTime: 95, entrances: 800, exits: 620, bounceRate: 35.2 },
    { path: '/blog/getting-started', views: 1560, uniqueViews: 1400, avgTime: 210, entrances: 1100, exits: 420, bounceRate: 22.8 },
    { path: '/contact', views: 980, uniqueViews: 890, avgTime: 60, entrances: 320, exits: 580, bounceRate: 45.3 },
    { path: '/about', views: 720, uniqueViews: 650, avgTime: 55, entrances: 180, exits: 420, bounceRate: 52.1 },
    { path: '/docs/api-reference', views: 540, uniqueViews: 480, avgTime: 180, entrances: 220, exits: 150, bounceRate: 18.9 },
    { path: '/blog/analytics-tips', views: 380, uniqueViews: 350, avgTime: 195, entrances: 280, exits: 120, bounceRate: 20.4 },
];

export const funnelSteps = [
    { name: 'Landing Page', visitors: 5200, rate: 100 },
    { name: 'View Pricing', visitors: 3120, rate: 60 },
    { name: 'Start Trial', visitors: 1248, rate: 24 },
    { name: 'Complete Setup', visitors: 874, rate: 16.8 },
    { name: 'First Conversion', visitors: 524, rate: 10.1 },
];

export const heatmapPoints = [
    { x: 50, y: 8, intensity: 0.95, label: 'Logo/Nav' },
    { x: 75, y: 8, intensity: 0.72, label: 'CTA Button' },
    { x: 50, y: 25, intensity: 0.88, label: 'Hero CTA' },
    { x: 30, y: 45, intensity: 0.65, label: 'Feature 1' },
    { x: 50, y: 45, intensity: 0.58, label: 'Feature 2' },
    { x: 70, y: 45, intensity: 0.52, label: 'Feature 3' },
    { x: 50, y: 60, intensity: 0.78, label: 'Pricing Toggle' },
    { x: 35, y: 72, intensity: 0.82, label: 'Pro Plan' },
    { x: 65, y: 72, intensity: 0.45, label: 'Enterprise' },
    { x: 50, y: 88, intensity: 0.35, label: 'Footer Links' },
];

export const sessions = [
    { id: 'sess_1a2b3c', visitorId: 'v_8x9y', duration: 245, pages: 6, device: 'Desktop', browser: 'Chrome', country: 'US', startPage: '/', timestamp: '2024-01-14T14:23:00Z' },
    { id: 'sess_4d5e6f', visitorId: 'v_3m4n', duration: 180, pages: 4, device: 'Mobile', browser: 'Safari', country: 'UK', startPage: '/pricing', timestamp: '2024-01-14T14:18:00Z' },
    { id: 'sess_7g8h9i', visitorId: 'v_5p6q', duration: 420, pages: 8, device: 'Desktop', browser: 'Firefox', country: 'DE', startPage: '/blog/getting-started', timestamp: '2024-01-14T14:12:00Z' },
    { id: 'sess_0j1k2l', visitorId: 'v_7r8s', duration: 95, pages: 2, device: 'Tablet', browser: 'Safari', country: 'FR', startPage: '/', timestamp: '2024-01-14T14:05:00Z' },
    { id: 'sess_3m4n5o', visitorId: 'v_9t0u', duration: 310, pages: 5, device: 'Desktop', browser: 'Chrome', country: 'CA', startPage: '/features', timestamp: '2024-01-14T13:58:00Z' },
    { id: 'sess_6p7q8r', visitorId: 'v_1v2w', duration: 150, pages: 3, device: 'Mobile', browser: 'Chrome', country: 'AU', startPage: '/docs', timestamp: '2024-01-14T13:45:00Z' },
    { id: 'sess_9s0t1u', visitorId: 'v_3x4y', duration: 520, pages: 11, device: 'Desktop', browser: 'Edge', country: 'US', startPage: '/', timestamp: '2024-01-14T13:30:00Z' },
    { id: 'sess_2v3w4x', visitorId: 'v_5z6a', duration: 78, pages: 2, device: 'Mobile', browser: 'Safari', country: 'JP', startPage: '/pricing', timestamp: '2024-01-14T13:22:00Z' },
];

export const insights = [
    { type: 'trend' as const, priority: 'high' as const, title: 'Traffic surge detected', description: 'Pageviews increased 42% compared to last week, primarily from organic search.', metric: 'Pageviews', value: '+42%', recommendation: 'Capitalize on this momentum by publishing more content targeting your high-performing keywords.' },
    { type: 'anomaly' as const, priority: 'high' as const, title: 'Bounce rate spike on /pricing', description: 'Bounce rate on the pricing page jumped to 65% (from 28%) in the last 24 hours.', metric: 'Bounce Rate', value: '65%', recommendation: 'Check for broken elements or slow load times. Consider A/B testing pricing layout.' },
    { type: 'opportunity' as const, priority: 'medium' as const, title: 'High-converting traffic source', description: 'Visitors from Product Hunt have a 6.4% conversion rate — 2x your average.', metric: 'Conversion', value: '6.4%', recommendation: 'Increase investment in Product Hunt presence. Schedule regular launches and updates.' },
    { type: 'performance' as const, priority: 'medium' as const, title: '/blog pages load slowly on mobile', description: 'Average load time for blog pages on mobile is 4.2s (target: <2s).', metric: 'Load Time', value: '4.2s', recommendation: 'Optimize images, enable lazy loading, and consider a CDN for static assets.' },
    { type: 'trend' as const, priority: 'low' as const, title: 'Mobile traffic growing steadily', description: 'Mobile visitors now account for 48% of all traffic, up from 35% last quarter.', metric: 'Mobile Share', value: '48%', recommendation: 'Ensure all conversion flows are optimized for mobile experience.' },
    { type: 'warning' as const, priority: 'high' as const, title: 'Setup funnel drop-off increasing', description: '52% of users who start the trial drop off at the "Complete Setup" step.', metric: 'Drop-off', value: '52%', recommendation: 'Simplify onboarding: reduce required fields and add progress indicators.' },
];

export const reportTemplates = [
    { id: 'weekly', name: 'Weekly Traffic Summary', description: 'Overview of traffic, sources, and top pages', schedule: 'Every Monday', lastRun: '2024-01-14' },
    { id: 'monthly', name: 'Monthly Performance Report', description: 'Comprehensive monthly analytics with trends', schedule: 'First of month', lastRun: '2024-01-01' },
    { id: 'conversions', name: 'Conversions & Funnels', description: 'Funnel performance and conversion rates', schedule: 'On demand', lastRun: '2024-01-12' },
    { id: 'campaigns', name: 'Campaign Analysis', description: 'UTM campaign performance metrics', schedule: 'Bi-weekly', lastRun: '2024-01-07' },
    { id: 'seo', name: 'SEO & Organic Report', description: 'Search engine traffic and keyword analysis', schedule: 'Weekly', lastRun: '2024-01-14' },
];
