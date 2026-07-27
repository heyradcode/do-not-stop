import { describe, expect, it } from 'vitest';

import { mergeBattleProgress } from '../../src/hooks/useBattleProgress';
import type { Pet } from '../../src/types/pet';

/**
 * The client-side half of the same merge the backend applies to opponents
 * (`battleProgress.overlay.ts`). Both must agree, or a player's own pet would show a
 * different level in their gallery than it does in someone else's opponent list.
 */

const chainPet: Pet = {
    id: '7',
    chain: 'evm',
    name: 'Rex',
    dna: 1234567890123456n,
    level: 3,
    rarity: 2,
    winCount: 1,
    lossCount: 0,
    readyAt: 100,
    xp: 40,
};

const progress = { id: '7', level: 12, xp: 340, winCount: 25, lossCount: 4, readyAt: 500 };

describe('mergeBattleProgress', () => {
    it('leaves a pet with no backend record on chain truth', () => {
        expect(mergeBattleProgress(chainPet, undefined)).toBe(chainPet);
    });

    it('takes level, xp and the win/loss record from backend progression', () => {
        const merged = mergeBattleProgress(chainPet, progress);

        expect(merged.level).toBe(12);
        expect(merged.xp).toBe(340);
        expect(merged.winCount).toBe(25);
        expect(merged.lossCount).toBe(4);
    });

    it('leaves chain-owned fields alone', () => {
        const merged = mergeBattleProgress(chainPet, progress);

        expect(merged.dna).toBe(1234567890123456n);
        expect(merged.rarity).toBe(2);
        expect(merged.name).toBe('Rex');
    });

    it('takes the later of the two cooldowns', () => {
        expect(mergeBattleProgress(chainPet, progress).readyAt).toBe(500);
        // A newly bred pet's on-chain newborn lockout outlives its backend cooldown.
        expect(mergeBattleProgress({ ...chainPet, readyAt: 9000 }, progress).readyAt).toBe(9000);
    });

    it('does not mutate the pet it was given', () => {
        mergeBattleProgress(chainPet, progress);

        expect(chainPet.level).toBe(3);
        expect(chainPet.readyAt).toBe(100);
    });
});
