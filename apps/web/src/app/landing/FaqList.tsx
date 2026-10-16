import { faqs } from './content';

// Native <details>, so the answers open without JavaScript and stay findable with Ctrl+F.
export default function FaqList() {
    return (
        <div className="lp-faq">
            {faqs.map(item => (
                <details key={item.q}>
                    <summary>{item.q}</summary>
                    <p>{item.a}</p>
                </details>
            ))}
        </div>
    );
}

export function faqStructuredData() {
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map(item => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
    };
}
