import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { decodeBattleRequest } from '../../../src/features/settle-keeper-solana/battleRequests';

describe('decodeBattleRequest', () => {
    const attackerOwner = PublicKey.unique();
    const defenderOwner = PublicKey.unique();
    const randomnessAccount = PublicKey.unique();

    it('decodes plain-number pet ids (newer Anchor clients)', () => {
        const decoded = decodeBattleRequest({
            attackerOwner,
            defenderOwner,
            attackerPetId: 1,
            defenderPetId: 2,
            randomnessAccount,
        });
        expect(decoded).toEqual({
            attackerOwner,
            defenderOwner,
            attackerPetId: 1,
            defenderPetId: 2,
            randomnessAccount,
        });
    });

    it('decodes BN-wrapped pet ids (older Anchor clients)', () => {
        const decoded = decodeBattleRequest({
            attackerOwner,
            defenderOwner,
            attackerPetId: new BN(1),
            defenderPetId: new BN(2),
            randomnessAccount,
        });
        expect(decoded.attackerPetId).toBe(1);
        expect(decoded.defenderPetId).toBe(2);
    });
});
