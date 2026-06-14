import { describe, expect, it } from 'vitest';
import { buildBattleSummaryContext } from './render';
import type { SettledBattle } from '../../../grpc/battleStream';

/** A settled battle with the v2 sim outputs at their (v1-row) defaults. */
const base: SettledBattle = {
    chain: 'evm',
    battleId: 'b1',
    attackerPet: '1',
    defenderPet: '2',
    winnerPet: '1',
    version: 1n,
    foughtAt: 1700000000,
    loserPet: '2',
    seed: '0xseed',
    rounds: 0,
    winnerHpRemaining: 0,
    xpWin: 0,
    xpLoss: 0,
};

describe('buildBattleSummaryContext', () => {
    it('returns empty when there is nothing meaningful (a v1 / all-default row)', () => {
        expect(buildBattleSummaryContext(base)).toBe('');
    });

    it('flags a swift, decisive bout and carries the HP margin + XP swing', () => {
        const summary = buildBattleSummaryContext({
            ...base,
            rounds: 2,
            winnerHpRemaining: 80,
            xpWin: 10,
            xpLoss: 3,
        });
        expect(summary).toContain('swift');
        expect(summary).toContain('2 rounds');
        expect(summary).toContain('80 HP');
        expect(summary).toContain('winner +10');
        expect(summary).toContain('loser +3');
    });

    it('uses singular wording for a one-round fight', () => {
        expect(buildBattleSummaryContext({ ...base, rounds: 1 })).toContain('1 round.');
    });

    it('flags a grueling war for a long fight', () => {
        expect(buildBattleSummaryContext({ ...base, rounds: 20 })).toContain('grueling');
    });

    it('calls a mid-length fight back-and-forth', () => {
        expect(buildBattleSummaryContext({ ...base, rounds: 7 })).toContain('back-and-forth');
    });

    it('never names the winner (the outcome block already fixes that)', () => {
        const summary = buildBattleSummaryContext({ ...base, rounds: 5, winnerHpRemaining: 40 });
        expect(summary.toLowerCase()).not.toContain('winner_pet');
    });
});
