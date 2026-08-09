/**
 * Media queries the site branches on.
 *
 * Named once because a mistyped query is a silent failure: it simply never
 * matches, so the guard it was meant to be quietly stops guarding and the
 * behaviour it protected runs for everyone.
 */

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** A pointer that can hover and aim precisely — mouse or trackpad, not touch. */
export const FINE_POINTER = '(hover: hover) and (pointer: fine)';

export const prefersReducedMotion = (): boolean => window.matchMedia(REDUCED_MOTION).matches;

export const hasFinePointer = (): boolean => window.matchMedia(FINE_POINTER).matches;
