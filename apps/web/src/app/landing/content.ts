// Copy shared by the landing page, /compare and the FAQ structured data.
// Plain strings only, so the same text can go into JSON-LD.

export const faqs: { q: string; a: string }[] = [
    {
        q: 'Will it slow my site down?',
        a: 'The script is about 6 KB gzipped and loads asynchronously, so your page renders without waiting for it. There is no tag manager and nothing to add to your build.',
    },
    {
        q: 'Can you see passwords or card numbers?',
        a: 'No. Every form input is masked in the browser before anything is sent, so a replay shows that someone typed in a field, not what they typed.',
    },
    {
        q: 'Do I need a cookie banner for Thravic?',
        a: 'Thravic sets no cookies; visits are counted with browser storage instead. It honors Do Not Track and Global Privacy Control, and consent mode can hold all tracking until a visitor opts in. Whether your site needs a banner also depends on your other tools and local law, so check with whoever looks after your privacy policy.',
    },
    {
        q: 'What counts as an event?',
        a: 'One thing a visit records: a page view, a click, a scroll milestone, a JavaScript error, or a custom event you send yourself.',
    },
    {
        q: 'What happens when I reach my event limit?',
        a: 'We email you at 80% and again at 100%. At the limit, new events stop being stored until your allowance resets: at the start of each paid period, or each calendar month on the free plan. Everything already collected stays, and you can upgrade at any time.',
    },
    {
        q: 'Do paid plans renew automatically?',
        a: 'No. Payments are one-off: each one covers 30 days on a monthly plan or a year on a yearly one, and nothing is charged again unless you pay again. When a period ends you keep access for 3 more days, then the account moves to the free plan. Your data from the paid plan is kept for 90 days in case you come back.',
    },
    {
        q: 'How do I pay?',
        a: 'Prices are in naira and checkout runs through Paystack, from the billing page in your dashboard. The free plan needs no card.',
    },
    {
        q: 'Does it work for mobile apps?',
        a: 'Yes. The @thravic/react-native SDK works with React Native and Expo, including Expo Go. App screens, sessions, versions and devices appear in the same dashboard as your website.',
    },
    {
        q: 'Can I look around before signing up?',
        a: 'Yes. The live demo is the real dashboard filled with sample data, and it needs no account.',
    },
];

// Checked against each product's public pages in October 2026. Only rows we
// can state with confidence; update the date whenever a row changes.
export const COMPARE_CHECKED = 'October 2026';

export const compareTools = ['Thravic', 'Microsoft Clarity', 'Hotjar', 'Google Analytics 4'] as const;

export const compareRows: { label: string; values: [string, string, string, string] }[] = [
    { label: 'Session replays', values: ['Yes', 'Yes', 'Yes', 'No'] },
    { label: 'Heatmaps', values: ['Yes', 'Yes', 'Yes', 'No'] },
    { label: 'Conversion funnels', values: ['Yes', 'Yes', 'Yes', 'Yes'] },
    { label: 'Sets cookies', values: ['No', 'Yes, by default', 'Yes', 'Yes'] },
    { label: 'Price', values: ['Free plan; paid plans in naira', 'Free', 'Free plan; paid plans in US dollars', 'Free'] },
];
