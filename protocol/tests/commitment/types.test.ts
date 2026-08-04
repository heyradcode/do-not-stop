import { describe, expect, it } from 'vitest';

import {
    assertBattleCommitment,
    type BattleCommitment,
    findEquivocations,
    hashBattleCommitment,
    MAX_COMMITMENT_OFFSET_ROUNDS,
    verifyCommitmentChain,
} from '../../src/commitment';
import type { Hex } from '../../src/encoding/bytes';
import { commitmentRound, QUICKNET, roundTime } from '../../src/randomness';
import type { BattleSnapshot } from '../../src/snapshot';

const ACCEPTED_AT = roundTime(QUICKNET, 1000);

const SNAPSHOT: BattleSnapshot = {
    domain: { chainId: 'eip155:84532', deploymentId: 'base-sepolia-live' },
    attacker: {
        petId: 1n,
        owner: '0xabcdef0123456789abcdef0123456789abcdef01',
        dna: 1234567890123456n,
        rarity: 3,
        level: 10,
        skill: 4,
        xp: 120,
        lastOpponentId: 0n,
        streak: 0,
        readyAt: ACCEPTED_AT - 100,
        sourceVersion: BigInt(ACCEPTED_AT - 50),
    },
    defender: {
        petId: 2n,
        owner: '0x2222222222222222222222222222222222222222',
        dna: 6543210987654321n,
        rarity: 2,
        level: 11,
        skill: 7,
        xp: 45,
        lastOpponentId: 1n,
        streak: 2,
        readyAt: ACCEPTED_AT - 100,
        sourceVersion: BigInt(ACCEPTED_AT - 50),
    },
    takenAt: ACCEPTED_AT - 1,
};

const VALID: BattleCommitment = {
    domain: { chainId: 'eip155:84532', deploymentId: 'base-sepolia-live' },
    battleId: 'btl_0001',
    intentHash: `0x${'11'.repeat(32)}`,
    defenseAuthorizationHash: `0x${'22'.repeat(32)}`,
    snapshot: SNAPSHOT,
    rulesetVersion: 1,
    rulesetHash: `0x${'ab'.repeat(32)}`,
    drandChainHash: QUICKNET.chainHash,
    drandRound: commitmentRound(QUICKNET, ACCEPTED_AT),
    acceptedAt: ACCEPTED_AT,
    previousCommitmentHash: null,
    signingKeyId: 'battle-signer-2026-07',
};

describe('the commit-before-reveal property', () => {
    it('accepts a round that has not published at acceptance', () => {
        expect(() => assertBattleCommitment(VALID)).not.toThrow();
        expect(roundTime(QUICKNET, VALID.drandRound)).toBeGreaterThan(VALID.acceptedAt);
    });

    it('rejects a round that already published', () => {
        // Committing to a value already known is the reroll attack, so it is
        // rejected by arithmetic anyone can redo from the commitment alone.
        expect(() => assertBattleCommitment({ ...VALID, drandRound: 1000 })).toThrow(
            /committing to a known value is the reroll attack/,
        );
    });

    it('rejects a round publishing exactly at acceptance', () => {
        const round = latestRoundExactlyAt(VALID.acceptedAt);
        expect(() => assertBattleCommitment({ ...VALID, drandRound: round })).toThrow(/reroll attack/);
    });

    it('rejects a round too far in the future', () => {
        // Naming a round hours away is a stall rather than a reroll, but it is still
        // a decision nobody agreed to.
        const tooFar = VALID.drandRound + MAX_COMMITMENT_OFFSET_ROUNDS;
        expect(() => assertBattleCommitment({ ...VALID, drandRound: tooFar })).toThrow(/rounds past acceptance/);
    });

    it('accepts the ceiling exactly', () => {
        const ceiling = 1000 + MAX_COMMITMENT_OFFSET_ROUNDS;
        expect(() => assertBattleCommitment({ ...VALID, drandRound: ceiling })).not.toThrow();
    });

    it('rejects a snapshot taken after acceptance', () => {
        expect(() =>
            assertBattleCommitment({
                ...VALID,
                snapshot: { ...SNAPSHOT, takenAt: VALID.acceptedAt + 1 },
            }),
        ).toThrow(/the photo must precede the commitment/);
    });

    it('refuses a drand chain this build does not pin', () => {
        expect(() =>
            assertBattleCommitment({
                ...VALID,
                drandChainHash: `0x${'99'.repeat(32)}`,
            }),
        ).toThrow(/is not pinned/);
    });
});

describe('assertBattleCommitment field validation', () => {
    it.each([
        ['battleId', { battleId: 'battle id with spaces' }],
        ['signingKeyId', { signingKeyId: '' }],
        ['intentHash', { intentHash: '0x1234' as Hex }],
        ['defenseAuthorizationHash', { defenseAuthorizationHash: '0x1234' as Hex }],
        ['rulesetHash', { rulesetHash: '0x1234' as Hex }],
        ['previousCommitmentHash', { previousCommitmentHash: '0x1234' as Hex }],
        ['rulesetVersion', { rulesetVersion: 0 }],
        ['acceptedAt', { acceptedAt: 0 }],
    ])('rejects an invalid %s', (_field, patch) => {
        expect(() => assertBattleCommitment({ ...VALID, ...patch } as BattleCommitment)).toThrow();
    });

    it('allows a null previous hash for the first commitment under a key', () => {
        expect(() => assertBattleCommitment({ ...VALID, previousCommitmentHash: null })).not.toThrow();
    });
});

describe('verifyCommitmentChain', () => {
    const first = { ...VALID, battleId: 'btl_0001', previousCommitmentHash: null };
    const second = {
        ...VALID,
        battleId: 'btl_0002',
        acceptedAt: VALID.acceptedAt + 3,
        drandRound: commitmentRound(QUICKNET, VALID.acceptedAt + 3),
        previousCommitmentHash: hashBattleCommitment(first),
    };
    const third = {
        ...VALID,
        battleId: 'btl_0003',
        acceptedAt: VALID.acceptedAt + 6,
        drandRound: commitmentRound(QUICKNET, VALID.acceptedAt + 6),
        previousCommitmentHash: hashBattleCommitment(second),
    };

    it('accepts an unbroken run', () => {
        expect(verifyCommitmentChain([first, second, third], null)).toEqual({ ok: true });
    });

    it('accepts a window without checking its anchor when none is supplied', () => {
        expect(verifyCommitmentChain([second, third])).toEqual({ ok: true });
    });

    it('reports a wrong anchor at the first element', () => {
        expect(verifyCommitmentChain([second, third], null)).toEqual({
            ok: false,
            index: 0,
            reason: 'wrong-anchor',
        });
    });

    it('reports a removed entry as a broken link', () => {
        // Dropping a battle from the middle is the tamper this chain exists to make
        // visible: `third` no longer links to its predecessor.
        expect(verifyCommitmentChain([first, third], null)).toEqual({
            ok: false,
            index: 1,
            reason: 'broken-link',
        });
    });

    it('reports a repeated battle id', () => {
        const duplicate = { ...second, battleId: first.battleId };
        expect(verifyCommitmentChain([first, duplicate], null)).toEqual({
            ok: false,
            index: 1,
            reason: 'duplicate-battle-id',
        });
    });

    it('reports acceptance time moving backwards', () => {
        const backwards = { ...second, acceptedAt: first.acceptedAt - 3 };
        const relinked = { ...backwards, previousCommitmentHash: hashBattleCommitment(first) };
        expect(verifyCommitmentChain([first, relinked], null)).toEqual({
            ok: false,
            index: 1,
            reason: 'time-went-backwards',
        });
    });

    it('accepts an empty run', () => {
        expect(verifyCommitmentChain([], null)).toEqual({ ok: true });
    });
});

describe('findEquivocations', () => {
    it('finds two different commitments for one battle', () => {
        // What a reroll looks like from outside: same battleId, two signed
        // statements about which round it uses.
        const rerolled = { ...VALID, drandRound: VALID.drandRound + 1 };
        expect(findEquivocations([VALID, rerolled])).toEqual([VALID.battleId]);
    });

    it('ignores an exact duplicate, which is a re-delivery rather than a contradiction', () => {
        expect(findEquivocations([VALID, { ...VALID }])).toEqual([]);
    });

    it('finds nothing in a clean set', () => {
        expect(findEquivocations([VALID, { ...VALID, battleId: 'btl_0002' }])).toEqual([]);
    });
});

function latestRoundExactlyAt(seconds: number): number {
    return (seconds - QUICKNET.genesisTimeSeconds) / QUICKNET.periodSeconds;
}
