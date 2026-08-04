import { describe, expect, it } from 'vitest';

import { simulate } from '../../src/combat';
import type { Hex } from '../../src/encoding/bytes';
import { computeProgression } from '../../src/progression';
import { deriveBattleSeed, QUICKNET, roundTime } from '../../src/randomness';
import {
    assertBattleReceipt,
    type BattleReceipt,
    findReceiptEquivocations,
    hashBattleReceipt,
    hashCombatLog,
    petPreviousReceiptHash,
    verifyPetReceiptChain,
    verifyReceiptBeacon,
    verifyReceiptChain,
    verifyReceiptConsistency,
    verifyReceiptProgression,
} from '../../src/receipt';
import { hashRuleset, SOURCE_DEFAULT_RULESET } from '../../src/ruleset';
import { type BattleSnapshot, hashBattleSnapshot } from '../../src/snapshot';

/** Real quicknet round 1000 (tests/fixtures/drand.json), so beacon checks are genuine. */
const BEACON = {
    chainHash: QUICKNET.chainHash,
    round: 1000,
    signature:
        '0xb44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39' as Hex,
    randomness: '0xfe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd' as Hex,
};
const PUBLISHED_AT = roundTime(QUICKNET, BEACON.round);
const DOMAIN = { chainId: 'eip155:84532' as const, deploymentId: 'base-sepolia-live' };
const RULESET_HASH = hashRuleset(SOURCE_DEFAULT_RULESET);

const SNAPSHOT: BattleSnapshot = {
    domain: DOMAIN,
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
        readyAt: PUBLISHED_AT - 100,
        sourceVersion: BigInt(PUBLISHED_AT - 50),
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
        readyAt: PUBLISHED_AT - 100,
        sourceVersion: BigInt(PUBLISHED_AT - 50),
    },
    takenAt: PUBLISHED_AT - 6,
};

function build(overrides: Partial<BattleReceipt> = {}, battleId = 'btl_0001'): BattleReceipt {
    // The seed is derived from whichever beacon the caller supplies, because it has to
    // be: validation rejects a receipt whose seed does not follow from its own inputs, so
    // there is no way to build a receipt with a beacon it was not seeded from.
    const beacon = overrides.beacon ?? BEACON;
    const seed = deriveBattleSeed({
        domain: DOMAIN,
        drandRandomness: beacon.randomness,
        battleId,
        snapshotHash: hashBattleSnapshot(SNAPSHOT),
        rulesetHash: RULESET_HASH,
    });
    const outcome = simulate(
        SNAPSHOT.attacker.dna,
        SNAPSHOT.attacker.rarity,
        SNAPSHOT.attacker.level,
        SNAPSHOT.attacker.skill,
        SNAPSHOT.defender.dna,
        SNAPSHOT.defender.rarity,
        SNAPSHOT.defender.level,
        SNAPSHOT.defender.skill,
        seed.value,
        SOURCE_DEFAULT_RULESET.skillConfig,
    );
    return {
        domain: DOMAIN,
        battleId,
        intentHash: `0x${'11'.repeat(32)}`,
        commitmentHash: `0x${'22'.repeat(32)}`,
        defenseAuthorizationHash: `0x${'33'.repeat(32)}`,
        snapshot: SNAPSHOT,
        beacon,
        seed: seed.hex,
        rulesetVersion: SOURCE_DEFAULT_RULESET.version,
        rulesetHash: RULESET_HASH,
        result: {
            attackerWon: outcome.result.firstWins,
            rounds: outcome.result.rounds,
            winnerHpRemaining: outcome.result.winnerHpRemaining,
        },
        combatLogHash: hashCombatLog(outcome),
        progression: computeProgression(SNAPSHOT, outcome.result.firstWins),
        sequence: 1,
        previousReceiptHash: null,
        attackerPreviousReceiptHash: null,
        defenderPreviousReceiptHash: null,
        createdAt: PUBLISHED_AT + 1,
        signingKeyId: 'battle-signer-2026-07',
        ...overrides,
    };
}

const VALID = build();

describe('internal consistency', () => {
    it('accepts a coherent receipt', () => {
        expect(() => assertBattleReceipt(VALID)).not.toThrow();
    });

    it('rejects a seed that does not follow from its own inputs', () => {
        // The check that makes a receipt self-checking: you cannot staple a favourable
        // seed onto a real beacon and a real snapshot.
        expect(() => assertBattleReceipt({ ...VALID, seed: `0x${'99'.repeat(32)}` })).toThrow(
            /does not follow from this receipt inputs/,
        );
    });

    it('rejects randomness that is not the hash of the shipped signature', () => {
        expect(() =>
            assertBattleReceipt({
                ...VALID,
                beacon: { ...BEACON, randomness: `0x${'aa'.repeat(32)}` },
            }),
        ).toThrow(/is not the hash of the signature/);
    });

    it('rejects a snapshot from another deployment', () => {
        expect(() =>
            assertBattleReceipt({
                ...VALID,
                snapshot: { ...SNAPSHOT, domain: { ...DOMAIN, deploymentId: 'base-sepolia-staging' } },
            }),
        ).toThrow(/domain mismatch/);
    });

    it('rejects a receipt created before its beacon published', () => {
        expect(() => assertBattleReceipt({ ...VALID, createdAt: PUBLISHED_AT - 1 })).toThrow(
            /precedes drand round 1000/,
        );
    });

    it('rejects a receipt created before its snapshot was taken', () => {
        expect(() => assertBattleReceipt({ ...VALID, createdAt: SNAPSHOT.takenAt - 1 })).toThrow(
            /precedes the snapshot/,
        );
    });

    it('rejects an unpinned drand chain', () => {
        expect(() =>
            assertBattleReceipt({ ...VALID, beacon: { ...BEACON, chainHash: `0x${'99'.repeat(32)}` } }),
        ).toThrow(/is not pinned/);
    });

    it('ties a null global link to sequence 1 in both directions', () => {
        // Otherwise a chain could silently restart, and a withheld receipt would leave no
        // trace at all.
        expect(() => assertBattleReceipt({ ...VALID, sequence: 2 })).toThrow(/must link its predecessor/);
        expect(() =>
            assertBattleReceipt({ ...VALID, sequence: 1, previousReceiptHash: `0x${'44'.repeat(32)}` }),
        ).toThrow(/first receipt under a signing key must have no previousReceiptHash/);
    });

    it('allows per-pet links to be absent independently of the global one', () => {
        expect(() =>
            assertBattleReceipt({
                ...VALID,
                sequence: 2,
                previousReceiptHash: `0x${'44'.repeat(32)}`,
                attackerPreviousReceiptHash: null,
                defenderPreviousReceiptHash: `0x${'55'.repeat(32)}`,
            }),
        ).not.toThrow();
    });

    it.each([
        ['rounds 0', { result: { ...VALID.result, rounds: 0 } }],
        ['negative HP', { result: { ...VALID.result, winnerHpRemaining: -1 } }],
        ['rulesetVersion 0', { rulesetVersion: 0 }],
        ['sequence 0', { sequence: 0 }],
        ['bad combatLogHash', { combatLogHash: '0x1234' as Hex }],
    ])('rejects %s', (_label, patch) => {
        expect(() => assertBattleReceipt({ ...VALID, ...patch } as BattleReceipt)).toThrow();
    });
});

describe('verifyReceiptConsistency', () => {
    it('passes a receipt whose beacon and progression both check out', () => {
        expect(verifyReceiptConsistency(VALID, { maxLevel: 100 })).toEqual({ ok: true });
    });

    it('reports a forged beacon signature', () => {
        // Same round, a signature that is well-formed but not drand's.
        const forged = build({
            // Round 21000000's real signature, presented as round 1000. Well-formed, the
            // randomness matches the signature, and the seed follows from that randomness,
            // so everything cheap passes. Only the BLS check catches it, because the round
            // number is the message being signed.
            beacon: {
                ...BEACON,
                signature:
                    '0x971cbe88adc436f6411fd26d51887ede7ba144264cd05edec6645b5e170a7702d16082947a85d89c89cb47cd8eb7d817',
                randomness: '0x36ecd957580ee415f951370e2a5e13273be97de9072418aaf14d38242979e3c1',
            },
        });
        const result = verifyReceiptConsistency(forged, { maxLevel: 100 });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failures.map((f) => f.check)).toContain('beacon-signature');
        }
    });

    it('reports an inflated progression delta', () => {
        const inflated = build({
            progression: {
                ...VALID.progression,
                attacker: { ...VALID.progression.attacker, xpAwarded: 9999, level: 99 },
            },
        });
        const result = verifyReceiptConsistency(inflated, { maxLevel: 100 });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failures.map((f) => f.check)).toContain('progression');
            expect(result.failures[0]!.detail).toMatch(/xpAwarded: expected \d+, got 9999/);
        }
    });

    it('reports both failures rather than stopping at the first', () => {
        const broken = build({
            // Round 21000000's real signature, presented as round 1000. Well-formed, the
            // randomness matches the signature, and the seed follows from that randomness,
            // so everything cheap passes. Only the BLS check catches it, because the round
            // number is the message being signed.
            beacon: {
                ...BEACON,
                signature:
                    '0x971cbe88adc436f6411fd26d51887ede7ba144264cd05edec6645b5e170a7702d16082947a85d89c89cb47cd8eb7d817',
                randomness: '0x36ecd957580ee415f951370e2a5e13273be97de9072418aaf14d38242979e3c1',
            },
            progression: {
                ...VALID.progression,
                defender: { ...VALID.progression.defender, xp: 1 },
            },
        });
        const result = verifyReceiptConsistency(broken, { maxLevel: 100 });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failures).toHaveLength(2);
        }
    });

    it('fails rather than passing when given the wrong level cap', () => {
        // Passing parameters that do not match the named ruleset must not produce a false
        // pass: the progression simply will not reproduce.
        const atCap = build({ progression: computeProgression(SNAPSHOT, VALID.result.attackerWon, { maxLevel: 5 }) });
        expect(verifyReceiptConsistency(atCap, { maxLevel: 100 }).ok).toBe(false);
    });
});

describe('the halves on their own', () => {
    // The split exists so a verifier that could not obtain the named ruleset bundle can
    // still check the beacon, instead of reporting the whole receipt as unverifiable.
    const forgedBeacon = build({
        beacon: {
            ...BEACON,
            signature:
                '0x971cbe88adc436f6411fd26d51887ede7ba144264cd05edec6645b5e170a7702d16082947a85d89c89cb47cd8eb7d817',
            randomness: '0x36ecd957580ee415f951370e2a5e13273be97de9072418aaf14d38242979e3c1',
        },
    });

    it('verifyReceiptBeacon checks the beacon without needing any ruleset parameters', () => {
        expect(verifyReceiptBeacon(VALID)).toEqual({ ok: true });
        const result = verifyReceiptBeacon(forgedBeacon);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failures.map((f) => f.check)).toEqual(['beacon-signature']);
        }
    });

    it('verifyReceiptProgression checks progression without touching the beacon', () => {
        // The beacon here is forged, and this half must not notice or care.
        expect(verifyReceiptProgression(forgedBeacon, { maxLevel: 100 })).toEqual({ ok: true });

        const inflated = build({
            progression: { ...VALID.progression, attacker: { ...VALID.progression.attacker, xp: 9999 } },
        });
        const result = verifyReceiptProgression(inflated, { maxLevel: 100 });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failures.map((f) => f.check)).toEqual(['progression']);
        }
    });

    it('together they report exactly what the composed function reports', () => {
        const broken = build({
            beacon: forgedBeacon.beacon,
            progression: { ...VALID.progression, defender: { ...VALID.progression.defender, xp: 1 } },
        });
        const composed = verifyReceiptConsistency(broken, { maxLevel: 100 });
        const beacon = verifyReceiptBeacon(broken);
        const progression = verifyReceiptProgression(broken, { maxLevel: 100 });
        expect(composed).toEqual({
            ok: false,
            failures: [
                ...(beacon.ok ? [] : beacon.failures),
                ...(progression.ok ? [] : progression.failures),
            ],
        });
    });
});

describe('global receipt chain', () => {
    const first = build({}, 'btl_0001');
    const second = build(
        { sequence: 2, previousReceiptHash: hashBattleReceipt(first), createdAt: first.createdAt + 1 },
        'btl_0002',
    );
    const third = build(
        { sequence: 3, previousReceiptHash: hashBattleReceipt(second), createdAt: second.createdAt + 1 },
        'btl_0003',
    );

    it('accepts an unbroken run', () => {
        expect(verifyReceiptChain([first, second, third], null)).toEqual({ ok: true });
    });

    it('detects a withheld receipt through the sequence gap', () => {
        // The gap names the missing position, which the hash link alone cannot.
        const relinked = build(
            { sequence: 3, previousReceiptHash: hashBattleReceipt(first), createdAt: first.createdAt + 2 },
            'btl_0003',
        );
        expect(verifyReceiptChain([first, relinked], null)).toEqual({
            ok: false,
            index: 1,
            reason: 'sequence-not-consecutive',
        });
    });

    it('detects a removed receipt through the broken link', () => {
        expect(verifyReceiptChain([first, third], null)).toEqual({ ok: false, index: 1, reason: 'broken-link' });
    });

    it('rejects a run mixing signing keys', () => {
        const other = build(
            {
                sequence: 2,
                previousReceiptHash: hashBattleReceipt(first),
                signingKeyId: 'battle-signer-2026-08',
                createdAt: first.createdAt + 1,
            },
            'btl_0002',
        );
        expect(verifyReceiptChain([first, other], null)).toEqual({ ok: false, index: 1, reason: 'mixed-signing-key' });
    });

    it('rejects a wrong anchor and skips the check when none is given', () => {
        expect(verifyReceiptChain([second, third], null)).toEqual({ ok: false, index: 0, reason: 'wrong-anchor' });
        expect(verifyReceiptChain([second, third])).toEqual({ ok: true });
    });

    it('detects creation time moving backwards', () => {
        const backwards = build(
            { sequence: 2, previousReceiptHash: hashBattleReceipt(first), createdAt: first.createdAt - 1 },
            'btl_0002',
        );
        expect(verifyReceiptChain([first, backwards], null)).toEqual({
            ok: false,
            index: 1,
            reason: 'time-went-backwards',
        });
    });
});

describe('per-pet receipt chain', () => {
    // Pet 1 as attacker, then pet 1 again as attacker in a second battle.
    const first = build({}, 'btl_0001');
    const second = build(
        {
            sequence: 2,
            previousReceiptHash: hashBattleReceipt(first),
            attackerPreviousReceiptHash: hashBattleReceipt(first),
            defenderPreviousReceiptHash: hashBattleReceipt(first),
            createdAt: first.createdAt + 1,
        },
        'btl_0002',
    );

    it('walks one pet history without scanning everyone else', () => {
        // The reason the per-pet link exists: off-chain XP is not verifiable against the
        // chain, so proving a level means replaying that pet own battles.
        expect(verifyPetReceiptChain(1n, [first, second], null)).toEqual({ ok: true });
        expect(verifyPetReceiptChain(2n, [first, second], null)).toEqual({ ok: true });
    });

    it('detects a gap in a pet own history', () => {
        const detached = build(
            {
                sequence: 2,
                previousReceiptHash: hashBattleReceipt(first),
                attackerPreviousReceiptHash: null,
                createdAt: first.createdAt + 1,
            },
            'btl_0002',
        );
        expect(verifyPetReceiptChain(1n, [first, detached], null)).toEqual({
            ok: false,
            index: 1,
            reason: 'broken-link',
        });
    });

    it('rejects a receipt the pet was not in', () => {
        expect(verifyPetReceiptChain(99n, [first], null)).toEqual({ ok: false, index: 0, reason: 'broken-link' });
    });

    it('reports which link a pet follows', () => {
        expect(petPreviousReceiptHash(second, 1n)).toBe(second.attackerPreviousReceiptHash);
        expect(petPreviousReceiptHash(second, 2n)).toBe(second.defenderPreviousReceiptHash);
        expect(petPreviousReceiptHash(second, 3n)).toBeUndefined();
    });
});

describe('findReceiptEquivocations', () => {
    it('finds two different receipts for one battle', () => {
        const other = build({ signingKeyId: 'battle-signer-2026-08' }, 'btl_0001');
        expect(findReceiptEquivocations([VALID, other])).toEqual(['btl_0001']);
    });

    it('ignores an exact duplicate', () => {
        expect(findReceiptEquivocations([VALID, { ...VALID }])).toEqual([]);
    });
});

describe('combat log hash', () => {
    it('changes when the log changes, even with the same result', () => {
        // Binding the log stops the animation and the result being two different stories.
        const outcomeA = simulate(1234567890123456n, 3, 10, 4, 6543210987654321n, 2, 11, 7, 1n);
        const outcomeB = simulate(1234567890123456n, 3, 10, 4, 6543210987654321n, 2, 11, 7, 2n);
        expect(hashCombatLog(outcomeA)).not.toBe(hashCombatLog(outcomeB));
    });

    it('is deterministic', () => {
        const outcome = simulate(1234567890123456n, 3, 10, 4, 6543210987654321n, 2, 11, 7, 1n);
        expect(hashCombatLog(outcome)).toBe(hashCombatLog(outcome));
    });
});
