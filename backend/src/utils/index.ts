export function parseIntParam(
    value: unknown,
    fallback: number,
    min: number,
    max: number
): number {
    const n = Number.parseInt(String(value ?? ''), 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}
