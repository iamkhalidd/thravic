import { redirect } from 'next/navigation';

/**
 * Session playback lives at /dashboard/sessions, which is the route in the
 * sidebar. This path is kept only so existing links and bookmarks keep working.
 */
export default function RecordingsPage() {
    redirect('/dashboard/sessions');
}
