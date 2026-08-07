import { describe, expect, it } from 'vitest';

import { sameAccount, shortAddress } from '@utils/address';

describe('shortAddress', () => {
    it('truncates long addresses to head…tail', () => {
        expect(shortAddress('0x1234567890abcdef')).toBe('0x1234…cdef');
    });

    it('returns short strings unchanged', () => {
        expect(shortAddress('0x1234')).toBe('0x1234');
        expect(shortAddress('0x1234567890')).toBe('0x1234567890');
    });
});

describe('sameAccount', () => {
    const EVM = '0xAAAAbbbbCCCCddddEEEEffff0000111122223333';

    // EVM addresses are case-insensitive, and the backend stores them folded while a
    // wallet reports them checksummed — so an exact comparison would never match.
    it('treats EVM addresses as equal regardless of case', () => {
        expect(sameAccount(EVM, EVM.toLowerCase())).toBe(true);
        expect(sameAccount(EVM.toLowerCase(), EVM.toUpperCase().replace('0X', '0x'))).toBe(true);
    });

    it('separates different EVM addresses', () => {
        expect(sameAccount(EVM, '0x0000000000000000000000000000000000000000')).toBe(false);
    });

    // The reason this is not `toLowerCase()`: base58 is case-*significant*, so two
    // distinct Solana pubkeys can differ only in case and must not read as one player.
    it('does not fold base58 pubkeys', () => {
        expect(sameAccount('SoLpubkey11111111111111111111111111111111111', 'solpubkey11111111111111111111111111111111111')).toBe(false);
    });

    it('matches an identical Solana pubkey', () => {
        const key = 'SoLpubkey11111111111111111111111111111111111';
        expect(sameAccount(key, key)).toBe(true);
    });

    // A disconnected wallet is the empty string; nothing should light up as "you".
    it('never matches an empty address', () => {
        expect(sameAccount('', '')).toBe(false);
        expect(sameAccount(EVM, '')).toBe(false);
    });
});
