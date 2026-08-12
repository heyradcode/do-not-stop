import { describe, expect, it } from 'vitest';

import {
    PET_NAME_MAX_BYTES,
    isPetNameWithinChainLimit,
    petNameByteLength,
    truncatePetNameToChainLimit,
} from '../../src/utils/pets/petName';

/**
 * The unit these limits are measured in is the whole point. Both chains count UTF-8 bytes;
 * an HTML `maxLength` counts UTF-16 code units, which is what let a 20-character CJK name
 * through the form and into a reverting transaction.
 *
 * `Buffer.byteLength` is the independent check here — the implementation counts by hand,
 * because this package is consumed by React Native too.
 */

const bytesOf = (s: string) => Buffer.byteLength(s, 'utf8');

describe('petNameByteLength', () => {
    it('agrees with UTF-8 encoding across scripts', () => {
        for (const name of ['Sparky', 'Ünïcøde', '猫の名前', '🐉🔥', 'a🐉b猫c', '']) {
            expect(petNameByteLength(name)).toBe(bytesOf(name));
        }
    });

    // A surrogate pair is one code point of four bytes, not two of three. Iterating UTF-16
    // units instead would report six.
    it('counts an astral character once', () => {
        expect(petNameByteLength('🐉')).toBe(4);
        expect('🐉'.length).toBe(2);
    });
});

describe('isPetNameWithinChainLimit', () => {
    it('accepts a name at exactly the limit', () => {
        const name = 'a'.repeat(PET_NAME_MAX_BYTES);
        expect(petNameByteLength(name)).toBe(PET_NAME_MAX_BYTES);
        expect(isPetNameWithinChainLimit(name)).toBe(true);
    });

    it('rejects one byte over', () => {
        expect(isPetNameWithinChainLimit('a'.repeat(PET_NAME_MAX_BYTES + 1))).toBe(false);
    });

    // The bug: 20 characters is inside any `maxLength={20}` and 60 bytes on chain.
    it('rejects a 20-character CJK name that a UTF-16 cap would allow', () => {
        const name = '猫'.repeat(20);
        expect(name.length).toBe(20);
        expect(isPetNameWithinChainLimit(name)).toBe(false);
    });

    it('rejects 10 emoji for the same reason', () => {
        expect(isPetNameWithinChainLimit('🐉'.repeat(10))).toBe(false);
    });

    // EVM's _requireValidName needs len > 0, and every caller submits a trimmed name.
    it('rejects empty and whitespace-only names', () => {
        expect(isPetNameWithinChainLimit('')).toBe(false);
        expect(isPetNameWithinChainLimit('   ')).toBe(false);
    });

    it('measures the trimmed name, not the padding around it', () => {
        expect(isPetNameWithinChainLimit(`  ${'a'.repeat(PET_NAME_MAX_BYTES)}  `)).toBe(true);
    });
});

describe('truncatePetNameToChainLimit', () => {
    it('leaves a fitting name alone', () => {
        expect(truncatePetNameToChainLimit('Sparky')).toBe('Sparky');
    });

    it('cuts to the limit', () => {
        const cut = truncatePetNameToChainLimit('a'.repeat(100));
        expect(cut).toHaveLength(PET_NAME_MAX_BYTES);
    });

    // Cutting at a byte offset would leave half a character, which encodes back as a
    // replacement character and stores a name the player never typed.
    it('never splits a character', () => {
        const cut = truncatePetNameToChainLimit('猫'.repeat(20));
        expect(petNameByteLength(cut)).toBeLessThanOrEqual(PET_NAME_MAX_BYTES);
        expect(cut).toBe('猫'.repeat(10)); // 10 x 3 bytes = 30, an 11th would be 33
        expect(cut).not.toContain('�');
    });

    it('keeps a mixed-width name intact up to the cut', () => {
        const cut = truncatePetNameToChainLimit(`${'a'.repeat(30)}🐉x`);
        expect(cut).toBe('a'.repeat(30)); // the dragon needs 4 bytes, only 2 remain
        expect(petNameByteLength(cut)).toBe(30);
    });
});
