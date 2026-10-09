import type { MetadataRoute } from 'next';
import { ALLOW_INDEXING, PRIVATE_PATHS, SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
    if (!ALLOW_INDEXING) {
        return { rules: { userAgent: '*', disallow: '/' } };
    }
    return {
        rules: { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    };
}
