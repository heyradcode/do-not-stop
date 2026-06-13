import { describe, it, expect } from 'vitest';
import { isValidEthAddress } from './isValidEthAddress';

describe('isValidEthAddress', () => {
    it('accepts a canonical lowercase 0x address', () => {
        expect(isValidEthAddress('0x52908400098527886e0f7030069857d2e4169ee7')).toBe(true);
    });

    it('accepts mixed-case (checksummed) addresses', () => {
        expect(isValidEthAddress('0x52908400098527886E0F7030069857D2E4169EE7')).toBe(true);
        expect(isValidEthAddress('0xde709f2102306220921060314715629080e2fb77')).toBe(true);
    });

    it('rejects an address without the 0x prefix', () => {
        expect(isValidEthAddress('52908400098527886e0f7030069857d2e4169ee7')).toBe(false);
    });

    it('rejects an address that is too short', () => {
        expect(isValidEthAddress('0x52908400098527886e0f7030069857d2e4169ee')).toBe(false);
    });

    it('rejects an address that is too long', () => {
        expect(isValidEthAddress('0x52908400098527886e0f7030069857d2e4169ee77')).toBe(false);
    });

    it('rejects non-hex characters', () => {
        expect(isValidEthAddress('0x52908400098527886e0f7030069857d2e4169eeZ')).toBe(false);
    });

    it('rejects the empty string', () => {
        expect(isValidEthAddress('')).toBe(false);
    });

    it('does not match when surrounded by extra text', () => {
        expect(isValidEthAddress('  0x52908400098527886e0f7030069857d2e4169ee7  ')).toBe(false);
    });
});
