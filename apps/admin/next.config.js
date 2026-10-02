/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // Kept in parity with apps/web so both frontends can produce a
    // self-contained server bundle. Vercel ignores this option.
    output: 'standalone',
    env: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    },
};

module.exports = nextConfig;
