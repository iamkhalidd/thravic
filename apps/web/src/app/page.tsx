import LandingPage from './landing/LandingPage';
import { faqStructuredData } from './landing/FaqList';
import { fetchLandingTiers } from '@/lib/landingPlans';

// Server wrapper: the plans arrive with the page, so pricing never flashes or
// shows numbers that aren't the admin's current ones.
export default async function HomePage() {
    const tiers = await fetchLandingTiers();
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData()) }}
            />
            <LandingPage initialTiers={tiers} />
        </>
    );
}
