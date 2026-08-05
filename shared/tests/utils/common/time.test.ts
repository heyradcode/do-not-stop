import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { formatExpiry } from '../../../src/utils/common/time';

/**
 * `formatExpiry` renders the "Expires 5m" label a player reads before accepting or
 * declining a marriage proposal, so a wrong label is a wrong decision. It was
 * previously untested from either side: nothing here covered it, and the frontend's
 * marriage spec mocks it out.
 *
 * The clock is pinned rather than mocked away, because every branch is a comparison
 * against `Date.now()`.
 */
const NOW_SEC = 1_800_000_000;

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_SEC * 1000);
});

afterEach(() => {
    vi.useRealTimers();
});

/** An expiry `offset` seconds from the pinned now. */
const inSeconds = (offset: number) => NOW_SEC + offset;

describe('formatExpiry', () => {
    it('reports an expiry in the past as expired', () => {
        expect(formatExpiry(inSeconds(-1))).toBe('Expired');
        expect(formatExpiry(inSeconds(-86_400))).toBe('Expired');
    });

    // The boundary is `diff <= 0`, so the exact expiry second already reads as gone
    // rather than as "0m". A proposal is not acceptable on the second it lapses.
    it('reports the exact expiry second as expired', () => {
        expect(formatExpiry(inSeconds(0))).toBe('Expired');
    });

    // Minutes round *up*: 61 seconds left is "2m", never "1m". Rounding down would
    // let the label read 0m while the proposal is still live.
    it('rounds sub-hour remainders up to the next minute', () => {
        expect(formatExpiry(inSeconds(1))).toBe('1m');
        expect(formatExpiry(inSeconds(60))).toBe('1m');
        expect(formatExpiry(inSeconds(61))).toBe('2m');
        expect(formatExpiry(inSeconds(3_599))).toBe('60m');
    });

    it('switches to hours and minutes at exactly one hour', () => {
        expect(formatExpiry(inSeconds(3_600))).toBe('1h 0m');
        expect(formatExpiry(inSeconds(3_660))).toBe('1h 1m');
        expect(formatExpiry(inSeconds(7_199))).toBe('1h 59m');
        expect(formatExpiry(inSeconds(86_399))).toBe('23h 59m');
    });

    // Unlike the minute branch, hours and days truncate, so a day-scale label is
    // never optimistic: 47h reads as "1d", not "2d".
    it('switches to whole days at exactly 24 hours', () => {
        expect(formatExpiry(inSeconds(86_400))).toBe('1d');
        expect(formatExpiry(inSeconds(172_799))).toBe('1d');
        expect(formatExpiry(inSeconds(172_800))).toBe('2d');
    });
});
