/** Clamps to the 0-1 range every progress value on this site is expressed in. */
export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
