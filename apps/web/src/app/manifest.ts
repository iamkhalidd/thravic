import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: `${SITE_NAME} Analytics`,
        short_name: SITE_NAME,
        description: SITE_DESCRIPTION,
        start_url: '/',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
            { src: '/icon', sizes: '32x32', type: 'image/png' },
            { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
        ],
    };
}
