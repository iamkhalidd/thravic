import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// iOS home-screen icon. iOS rounds the corners itself, so no radius here.

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
                    paddingBottom: 30,
                }}
            >
                <span style={{ color: '#f4f1ea', fontSize: 150, fontWeight: 900, lineHeight: 1, letterSpacing: -6 }}>t</span>
                <span style={{ width: 30, height: 30, background: '#ff5a1f', borderRadius: 4, marginLeft: 6, marginBottom: 10 }} />
            </div>
        ),
        size,
    );
}
