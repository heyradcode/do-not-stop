import { describe, expect, it } from 'vitest';

import { formatTxHashHint } from '@hooks/usePetError';

describe('formatTxHashHint', () => {
    it('returns null when there is no hash', () => {
        expect(formatTxHashHint(undefined)).toBeNull();
        expect(formatTxHashHint('')).toBeNull();
    });

    it('truncates to the first 8 characters with an ellipsis', () => {
        expect(formatTxHashHint('0x1234567890abcdef')).toBe('0x123456…');
    });

    it('still truncates a hash shorter than the slice window', () => {
        expect(formatTxHashHint('0x12')).toBe('0x12…');
    });
});
