import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';

import { parseProgramId } from '../../../src/utils/solana/programId';

describe('parseProgramId', () => {
    it('returns null for missing or blank input', () => {
        expect(parseProgramId(null)).toBeNull();
        expect(parseProgramId(undefined)).toBeNull();
        expect(parseProgramId('')).toBeNull();
        expect(parseProgramId('   ')).toBeNull();
    });

    it('returns null for an invalid base58 string', () => {
        expect(parseProgramId('not a valid key!!')).toBeNull();
    });

    it('parses a valid base58 program id', () => {
        const key = Keypair.generate().publicKey;
        const parsed = parseProgramId(key.toBase58());
        expect(parsed).toBeInstanceOf(PublicKey);
        expect(parsed?.equals(key)).toBe(true);
    });

    it('trims surrounding whitespace', () => {
        const key = Keypair.generate().publicKey;
        expect(parseProgramId(`  ${key.toBase58()}  `)?.equals(key)).toBe(true);
    });
});
