/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // Self-contained server bundle for the Docker image.
    // Vercel ignores this option, so it is safe for both targets.
    output: 'standalone',
    eslint: {
        ignoreDuringBuilds: true,
    },
    env: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    },
};

module.exports = nextConfig;
