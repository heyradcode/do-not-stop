/**
 * Neon / cyberpunk palette — shared across screens (landing + in-app).
 */
export const neon = {
    bgDeep: '#05050d',
    bgPanel: '#0a0a18',
    bgCard: '#0f1022',
    bgInput: '#121428',
    cyan: '#00f5ff',
    magenta: '#ff2da6',
    purple: '#c084fc',
    violet: '#7c3aed',
    text: '#eef0ff',
    textMuted: '#8b95b8',
    textDim: '#5c6688',
    border: 'rgba(0, 245, 255, 0.28)',
    borderMagenta: 'rgba(255, 45, 166, 0.35)',
    danger: '#ff4d6d',
    success: '#39ffb4',
    /**
     * Wrong, but recoverable, and distinct from `danger` on purpose: a wrong network or a
     * testnet is a state the player can act their way out of, where `danger` reads as
     * something that already failed. Both `NetworkGate` and `EthereumNetworkSwitcher` had
     * this hue written out by hand before it had a name.
     */
    warning: '#ff9800',
    warningText: '#ffb74d',
    overlay: 'rgba(5, 5, 13, 0.92)',
} as const;

/**
 * A palette colour at an alpha.
 *
 * Tinted borders, fills and washes are all the hues above at some opacity, and they were
 * being written out by hand as `rgba(255, 152, 0, 0.55)` and friends. Spelling the hue twice
 * is how a tint drifts off the palette without anyone noticing, and it is why the warning
 * colour existed in two files before it existed here.
 *
 * Six-digit hex only, which is every colour in `neon` that is not already an rgba string.
 */
export function alpha(hex: string, a: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** iOS glow; Android leans on `elevation` + neon borders on cards. */
export function neonGlow(color: string, radius = 14, opacity = 0.55) {
    return {
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: opacity,
        shadowRadius: radius,
        elevation: 10,
    };
}
