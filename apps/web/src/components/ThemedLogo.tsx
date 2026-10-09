// Each PNG has transparent padding; `crop` is the lettering box inside it
const LOGOS = {
    light: { src: '/thravic-logo-light.png', w: 1200, h: 448, crop: [0, 46, 1156, 294] },
    dark: { src: '/thravic-logo-dark.png', w: 488, h: 160, crop: [0, 15, 461, 114] },
} as const;

function Wordmark({ variant, height }: { variant: keyof typeof LOGOS; height: number }) {
    const { src, w, h, crop } = LOGOS[variant];
    return (
        <span className={`logo-${variant}`} role="img" aria-label="Thravic">
            <svg viewBox={crop.join(' ')} height={height} width={Math.round((height * crop[2]) / crop[3])} aria-hidden>
                <image href={src} width={w} height={h} />
            </svg>
        </span>
    );
}

/**
 * The "thravic." wordmark: dark ink on the light theme, cream on the dark theme.
 * CSS picks the variant, so there is no flash before the theme is known.
 */
export function ThemedLogo({ height }: { height: number }) {
    return (
        <>
            <Wordmark variant="light" height={height} />
            <Wordmark variant="dark" height={height} />
        </>
    );
}
