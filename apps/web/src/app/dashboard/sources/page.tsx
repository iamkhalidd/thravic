import { redirect } from 'next/navigation';

/**
 * Traffic sources live at /dashboard/traffic/sources, which is the route in the
 * sidebar. This path is kept only so existing links and bookmarks keep working.
 */
export default function SourcesPage() {
    redirect('/dashboard/traffic/sources');
}
