/**
 * Neon palette tokens shared by `<Icon>`, `<NeonButton>`, and any other component
 * that opts into the tone-* CSS class convention (e.g. `.tone-cyan`).
 *
 * The string values are coupled to CSS class names — renaming a value here also
 * means renaming the matching `.tone-*` class in each component's stylesheet.
 *
 * Per-component subsets (IconTone, NeonButtonTone) are derived from `Tone` so
 * each component restricts which entries it actually accepts.
 */
export const Tones = {
    Cyan: 'cyan',
    Violet: 'violet',
    Magenta: 'magenta',
    Emerald: 'emerald',
    Amber: 'amber',
    Azure: 'azure',
    Inherit: 'inherit',
} as const;

export type Tone = (typeof Tones)[keyof typeof Tones];
