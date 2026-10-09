import type { MetadataRoute } from 'next';
import { PUBLIC_ROUTES, SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
    const lastModified = new Date();
    return PUBLIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
        url: `${SITE_URL}${path === '/' ? '' : path}`,
        lastModified,
        changeFrequency,
        priority,
    }));
}
