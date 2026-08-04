import { describe, expect, it } from 'vitest';

import { simulate } from '../../src/combat';
import type { Hex } from '../../src/encoding/bytes';
import { computeProgression } from '../../src/progression';
import { deriveBattleSeed, QUICKNET, roundTime } from '../../src/randomness';
import {
    assertBattleReceipt,
    type BattleReceipt,
    hashBattleReceipt,
    hashCombatLog,
    receiptFromWire,
    type WireBattleReceipt,
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

function build(): BattleReceipt {
    const seed = deriveBattleSeed({
        domain: DOMAIN,
        drandRandomness: BEACON.randomness,
        battleId: 'btl_0001',
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
        battleId: 'btl_0001',
        intentHash: `0x${'11'.repeat(32)}`,
        commitmentHash: `0x${'22'.repeat(32)}`,
        defenseAuthorizationHash: `0x${'33'.repeat(32)}`,
        snapshot: SNAPSHOT,
        beacon: BEACON,
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
    };
}

/** The exact replacer `sign.worker.ts` stores receipts through: bigint -> decimal string. */
function toWireJson(receipt: BattleReceipt): unknown {
    return JSON.parse(JSON.stringify(receipt, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)));
}

describe('receiptFromWire', () => {
    const receipt = build();

    it('round-trips a receipt through the exact JSON shape the backend serves', () => {
        const wire = toWireJson(receipt) as WireBattleReceipt;
        const restored = receiptFromWire(wire);

        expect(restored).toEqual(receipt);
        expect(hashBattleReceipt(restored)).toBe(hashBattleReceipt(receipt));
        expect(() => assertBattleReceipt(restored)).not.toThrow();
    });

    it('converts every bigint field independently, not just petId', () => {
        const wire = toWireJson(receipt) as WireBattleReceipt;
        expect(wire.snapshot.attacker.dna).toBe('1234567890123456');
        expect(wire.snapshot.defender.lastOpponentId).toBe('1');
        expect(wire.snapshot.attacker.sourceVersion).toBe(String(receipt.snapshot.attacker.sourceVersion));
        expect(wire.progression.defender.lastOpponentId).toBe(String(receipt.progression.defender.lastOpponentId));

        const restored = receiptFromWire(wire);
        expect(restored.snapshot.attacker.dna).toBe(1234567890123456n);
        expect(typeof restored.progression.attacker.petId).toBe('bigint');
    });

    it('throws on a bigint field that did not survive the wire cleanly', () => {
        const wire = toWireJson(receipt) as WireBattleReceipt;
        wire.snapshot.attacker.dna = 'not-a-number';
        expect(() => receiptFromWire(wire)).toThrow();
    });
});
