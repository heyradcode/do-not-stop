import { describe, expect, it } from 'vitest';

import { overlayRosterPet } from '../../src/repositories/battleProgress.overlay';
import type { RosterPet } from '../../src/repositories/roster.repository';

/**
 * The merge rule itself. `overlayRosterPet` is pure precisely so this can be pinned
 * without a database: it decides what level every player sees, and getting it backwards
 * (chain wins over backend) would silently undo every backend battle ever fought.
 */

const chainPet: RosterPet = {
    chain: 'evm',
    petId: '7',
    owner: '0xabc',
    name: 'Rex',
    level: 3,
    rarity: 2,
    dna: '1234567890123456',
    winCount: 1,
    lossCount: 0,
    readyAt: 100n,
    xp: 40,
    generation: 0,
    parent1Id: '0',
    parent2Id: '0',
    breedCount: 0,
    speciesId: 5,
    spouseId: '0',
    breedReadyAt: 0n,
    trainReadyAt: 0n,
    asset: '',
};

const progress = {
    petId: '7',
    level: 12,
    xp: 340,
    winCount: 25,
    lossCount: 4,
    readyAt: 500n,
};

describe('overlayRosterPet', () => {
    it('leaves a pet that has never fought a backend battle on chain truth', () => {
        expect(overlayRosterPet(chainPet, undefined)).toBe(chainPet);
    });

    it('takes level, xp and the win/loss record from backend progression', () => {
        const merged = overlayRosterPet(chainPet, progress);

        expect(merged.level).toBe(12);
        expect(merged.xp).toBe(340);
        expect(merged.winCount).toBe(25);
        expect(merged.lossCount).toBe(4);
    });

    it('leaves chain-owned fields alone', () => {
        // Everything the chain still writes — ownership, DNA, lineage, breed/train
        // cooldowns — must survive the overlay untouched.
        const merged = overlayRosterPet(chainPet, progress);

        expect(merged.owner).toBe('0xabc');
        expect(merged.dna).toBe('1234567890123456');
        expect(merged.rarity).toBe(2);
        expect(merged.speciesId).toBe(5);
        expect(merged.breedReadyAt).toBe(0n);
        expect(merged.trainReadyAt).toBe(0n);
    });

    it('takes the later cooldown when the backend one is still running', () => {
        expect(overlayRosterPet(chainPet, progress).readyAt).toBe(500n);
    });

    it('takes the later cooldown when the on-chain one is still running', () => {
        // A pet bred moments ago carries a newborn lockout the backend knows nothing
        // about. Taking the backend value blindly would let it fight through it.
        const newborn = { ...chainPet, readyAt: 9_000n };

        expect(overlayRosterPet(newborn, progress).readyAt).toBe(9_000n);
    });

    it('takes the greater level when paid on-chain upgrades moved ahead of the row', () => {
        // The row is seeded at first battle and battles stopped writing chain level,
        // but train()/levelUp() are live paid actions. A pet that battled at level 1
        // and was then levelled to 20 on chain must not keep fighting — or being
        // displayed and matchmade — as level 1.
        const upgraded = { ...chainPet, level: 20 };

        expect(overlayRosterPet(upgraded, progress).level).toBe(20);
    });

    it('keeps the backend level when battles moved ahead of the chain', () => {
        expect(overlayRosterPet(chainPet, progress).level).toBe(12);
    });

    it('does not mutate the pet it was given', () => {
        overlayRosterPet(chainPet, progress);

        expect(chainPet.level).toBe(3);
        expect(chainPet.readyAt).toBe(100n);
    });
});
