import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// Favicon: the wordmark's "t" and orange full stop on black.

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    background: '#000000',
                    borderRadius: 7,
                    paddingBottom: 3,
                }}
            >
                <span style={{ color: '#f4f1ea', fontSize: 28, fontWeight: 900, lineHeight: 1, letterSpacing: -1 }}>t</span>
                <span style={{ width: 6, height: 6, background: '#ff5a1f', borderRadius: 1, marginLeft: 1, marginBottom: 2 }} />
            </div>
        ),
        size,
    );
}
