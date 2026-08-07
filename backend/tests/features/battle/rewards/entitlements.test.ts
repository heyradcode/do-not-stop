import { describe, expect, it } from 'vitest';

import { computeEntitlements, totalEntitled, type BattleContribution, type RewardRates } from '@features/battle/rewards';

const ALICE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const CAROL = '0xcccccccccccccccccccccccccccccccccccccccc';

const RATES: RewardRates = { perWin: 100n, perLoss: 25n, perBattleCap: 1000n };

function battle(attackerOwner: string, defenderOwner: string, attackerWon: boolean): BattleContribution {
    return { attackerOwner, defenderOwner, attackerWon };
}

describe('attributing battles to wallets', () => {
    it('pays the winner and the loser their rates', () => {
        const result = computeEntitlements([battle(ALICE, BOB, true)], RATES);

        expect(result).toEqual([
            { wallet: ALICE, amount: 100n, breakdown: { battles: 1, wins: 1, losses: 0, capped: 0 } },
            { wallet: BOB, amount: 25n, breakdown: { battles: 1, wins: 0, losses: 1, capped: 0 } },
        ]);
    });

    it('credits the defender when the attacker loses', () => {
        const result = computeEntitlements([battle(ALICE, BOB, false)], RATES);
        expect(result.find((e) => e.wallet === BOB)?.amount).toBe(100n);
        expect(result.find((e) => e.wallet === ALICE)?.amount).toBe(25n);
    });

    it('aggregates across many battles', () => {
        const result = computeEntitlements(
            [battle(ALICE, BOB, true), battle(ALICE, CAROL, true), battle(BOB, ALICE, true)],
            RATES,
        );

        // Alice: two wins, one loss.
        expect(result.find((e) => e.wallet === ALICE)).toEqual({
            wallet: ALICE,
            amount: 225n,
            breakdown: { battles: 3, wins: 2, losses: 1, capped: 0 },
        });
    });

    it('counts a wallet fighting itself as both sides, which is what happened', () => {
        const result = computeEntitlements([battle(ALICE, ALICE, true)], RATES);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            wallet: ALICE,
            amount: 125n,
            breakdown: { battles: 2, wins: 1, losses: 1, capped: 0 },
        });
    });

    it('returns nothing for no battles', () => {
        expect(computeEntitlements([], RATES)).toEqual([]);
    });
});

describe('reproducibility', () => {
    it('sorts by wallet, so the tree does not depend on database row order', () => {
        // The leaf order defines the root. A player rebuilding it from the public corpus
        // has to arrive at the same one.
        const forward = computeEntitlements([battle(CAROL, ALICE, true), battle(BOB, ALICE, true)], RATES);
        const reversed = computeEntitlements([battle(BOB, ALICE, true), battle(CAROL, ALICE, true)], RATES);

        expect(forward.map((e) => e.wallet)).toEqual([ALICE, BOB, CAROL]);
        expect(forward).toEqual(reversed);
    });

    it('normalizes wallet casing, so one person is not two entitlements', () => {
        const result = computeEntitlements(
            [battle(ALICE.toUpperCase().replace('0X', '0x'), BOB, true), battle(ALICE, CAROL, true)],
            RATES,
        );

        expect(result.filter((e) => e.wallet === ALICE)).toHaveLength(1);
        expect(result.find((e) => e.wallet === ALICE)?.amount).toBe(200n);
    });
});

describe('the per-battle cap', () => {
    it('bounds a single battle rather than the mistake that produced it', () => {
        // The limit that survives a bug in the rates: an absurd perWin inflates one battle
        // to the cap, not to whatever the mistake produced.
        const absurd: RewardRates = { perWin: 10n ** 30n, perLoss: 0n, perBattleCap: 500n };
        const result = computeEntitlements([battle(ALICE, BOB, true)], absurd);

        expect(result.find((e) => e.wallet === ALICE)?.amount).toBe(500n);
    });

    it('records how many battles were capped, so the cause is visible', () => {
        const absurd: RewardRates = { perWin: 10_000n, perLoss: 0n, perBattleCap: 500n };
        const result = computeEntitlements([battle(ALICE, BOB, true), battle(ALICE, CAROL, true)], absurd);

        expect(result.find((e) => e.wallet === ALICE)?.breakdown.capped).toBe(2);
    });

    it('caps per battle, not per wallet, so honest battles still accumulate', () => {
        const rates: RewardRates = { perWin: 100n, perLoss: 0n, perBattleCap: 100n };
        const result = computeEntitlements([battle(ALICE, BOB, true), battle(ALICE, CAROL, true)], rates);

        expect(result.find((e) => e.wallet === ALICE)?.amount).toBe(200n);
        expect(result.find((e) => e.wallet === ALICE)?.breakdown.capped).toBe(0);
    });

    it('allows a zero loss rate without counting it as capped', () => {
        const result = computeEntitlements([battle(ALICE, BOB, true)], { perWin: 100n, perLoss: 0n, perBattleCap: 100n });
        expect(result.find((e) => e.wallet === BOB)).toEqual({
            wallet: BOB,
            amount: 0n,
            breakdown: { battles: 1, wins: 0, losses: 1, capped: 0 },
        });
    });
});

describe('rejecting nonsense rates', () => {
    it.each([
        ['perWin', { perWin: -1n }],
        ['perLoss', { perLoss: -1n }],
        ['perBattleCap', { perBattleCap: -1n }],
    ])('rejects a negative %s', (_field, patch) => {
        expect(() => computeEntitlements([battle(ALICE, BOB, true)], { ...RATES, ...patch })).toThrow(
            /non-negative bigint/,
        );
    });
});

describe('totalEntitled', () => {
    it('sums every entitlement, which is what the season cap must cover', () => {
        const result = computeEntitlements([battle(ALICE, BOB, true), battle(BOB, CAROL, true)], RATES);
        expect(totalEntitled(result)).toBe(250n);
    });

    it('is zero for an empty season', () => {
        expect(totalEntitled([])).toBe(0n);
    });
});
