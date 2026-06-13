import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';

import {
    battleRequestPda,
    breedRequestPda,
    globalStatePda,
    petPda,
    playerProfilePda,
} from '../../../src/utils/solana/pdas';

const programId = Keypair.generate().publicKey;
const owner = Keypair.generate().publicKey;

const isPdaResult = ([addr, bump]: [PublicKey, number]) => {
    expect(addr).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
};

describe('solana PDAs', () => {
    it('derives a deterministic global-state PDA', () => {
        const a = globalStatePda(programId);
        const b = globalStatePda(programId);
        isPdaResult(a);
        expect(a[0].equals(b[0])).toBe(true);
        expect(a[1]).toBe(b[1]);
    });

    it('derives distinct PDAs for different seeds', () => {
        const global = globalStatePda(programId)[0];
        const profile = playerProfilePda(programId, owner)[0];
        const breed = breedRequestPda(programId, owner)[0];
        const battle = battleRequestPda(programId, owner)[0];

        const all = [global, profile, breed, battle].map((k) => k.toBase58());
        expect(new Set(all).size).toBe(4);
    });

    it('encodes the pet id so different ids give different PDAs', () => {
        const pet1 = petPda(programId, owner, 1);
        const pet2 = petPda(programId, owner, 2);
        isPdaResult(pet1);
        expect(pet1[0].equals(pet2[0])).toBe(false);
    });

    it('ties the player profile PDA to its owner', () => {
        const otherOwner = Keypair.generate().publicKey;
        const a = playerProfilePda(programId, owner)[0];
        const b = playerProfilePda(programId, otherOwner)[0];
        expect(a.equals(b)).toBe(false);
    });
});
