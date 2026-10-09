import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// The preview card shown when a Thravic link is shared on X, LinkedIn, Slack,
// WhatsApp and in search results. Next also uses it as the Twitter image.

export const alt = 'Thravic: see why visitors leave, not just that they did';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
    // The real wordmark (cream on transparent, 488x160), inlined as a data URL.
    const logo = await fetch(new URL('../../public/thravic-logo-dark.png', import.meta.url)).then(r => r.arrayBuffer());
    let binary = '';
    new Uint8Array(logo).forEach(b => { binary += String.fromCharCode(b); });
    const logoSrc = `data:image/png;base64,${btoa(binary)}`;

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '72px 80px',
                    background: 'radial-gradient(circle at 85% 15%, #3a1a0c 0%, #000000 55%)',
                    color: '#f4f1ea',
                }}
            >
                {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
                <img src={logoSrc} width={244} height={80} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 980 }}>
                        See why visitors leave, not just that they did.
                    </div>
                    <div style={{ fontSize: 32, color: '#a3a8b0' }}>
                        Session replays · Heatmaps · Conversion funnels
                    </div>
                </div>
            </div>
        ),
        size,
    );
}
