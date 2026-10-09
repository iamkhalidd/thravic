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
    // Signed-in pages are client components and cannot export metadata, so
    // keep them out of search with a header instead.
    async headers() {
        const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
        return [
            { source: '/dashboard/:path*', headers: noindex },
            { source: '/auth/:path*', headers: noindex },
        ];
    },
};

module.exports = nextConfig;
