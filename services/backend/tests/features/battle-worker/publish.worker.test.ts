import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    computeProgression,
    deriveBattleSeed,
    hashBattleReceipt,
    hashBattleSnapshot,
    hashCombatLog,
    hashRuleset,
    QUICKNET,
    roundTime,
    simulate,
    SOURCE_DEFAULT_RULESET,
    type BattleReceipt,
    type BattleSnapshot,
    type Hex,
} from '@cryptopets/protocol';

vi.mock('@config/prisma', () => ({
    prisma: { battleLedger: { findUnique: vi.fn() }, battleReceipt: { findUnique: vi.fn() } },
}));
vi.mock('@features/battle-ledger', () => ({
    applyTransition: vi.fn(),
    completeOutbox: vi.fn(),
    claimOutbox: vi.fn(),
    failOutbox: vi.fn(),
    // The barrel pulls in the dispatcher, which builds its handler map from these. Every
    // topic has to be present or a missing one registers as an `undefined` key.
    OUTBOX_TOPICS: {
        awaitBeacon: 'await-beacon',
        compute: 'compute',
        verify: 'verify',
        sign: 'sign',
        publish: 'publish',
        batch: 'batch',
    },
}));
vi.mock('@ws/battleRoomSocket', () => ({ notifyBattleRoomIfPresent: vi.fn() }));

import { prisma } from '@config/prisma';
import { applyTransition, completeOutbox } from '@features/battle-ledger';
import { processPublishMessage } from '@features/battle-worker';
import { notifyBattleRoomIfPresent } from '@ws/battleRoomSocket';

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
        petId: 1n, owner: '0xabcdef0123456789abcdef0123456789abcdef01', dna: 1234567890123456n,
        rarity: 3, level: 10, skill: 4, xp: 120, lastOpponentId: 0n, streak: 0,
        readyAt: PUBLISHED_AT - 100, sourceVersion: BigInt(PUBLISHED_AT - 50),
    },
    defender: {
        petId: 2n, owner: '0x2222222222222222222222222222222222222222', dna: 6543210987654321n,
        rarity: 2, level: 11, skill: 7, xp: 45, lastOpponentId: 1n, streak: 2,
        readyAt: PUBLISHED_AT - 100, sourceVersion: BigInt(PUBLISHED_AT - 50),
    },
    takenAt: PUBLISHED_AT - 6,
};

function buildReceipt(): BattleReceipt {
    const seed = deriveBattleSeed({
        domain: DOMAIN,
        drandRandomness: BEACON.randomness,
        battleId: 'btl_0001',
        snapshotHash: hashBattleSnapshot(SNAPSHOT),
        rulesetHash: RULESET_HASH,
    });
    const outcome = simulate(
        SNAPSHOT.attacker.dna, SNAPSHOT.attacker.rarity, SNAPSHOT.attacker.level, SNAPSHOT.attacker.skill,
        SNAPSHOT.defender.dna, SNAPSHOT.defender.rarity, SNAPSHOT.defender.level, SNAPSHOT.defender.skill,
        seed.value, SOURCE_DEFAULT_RULESET.skillConfig,
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

const RECEIPT = buildReceipt();
const WIRE = JSON.parse(JSON.stringify(RECEIPT, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
const MESSAGE = { id: 'msg_1', battleId: 'btl_0001', topic: 'publish', payload: {}, attempts: 1 };
const BATTLE = { battleId: 'btl_0001', state: 'signed', roomId: 'room_1' };

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.battleLedger.findUnique).mockResolvedValue(BATTLE as never);
    vi.mocked(prisma.battleReceipt.findUnique).mockResolvedValue({
        receiptHash: hashBattleReceipt(RECEIPT),
        payload: WIRE,
    } as never);
});

describe('publishing a signed receipt', () => {
    it('moves the battle to published', async () => {
        await processPublishMessage(MESSAGE, PUBLISHED_AT + 10);

        expect(applyTransition).toHaveBeenCalledWith(
            expect.objectContaining({ battleId: 'btl_0001', from: 'signed', to: 'published' }),
        );
        expect(completeOutbox).toHaveBeenCalledWith('msg_1', expect.any(Date));
    });

    it('enqueues nothing, since batching is not per-battle work', async () => {
        await processPublishMessage(MESSAGE, PUBLISHED_AT + 10);
        const call = vi.mocked(applyTransition).mock.calls[0]![0] as { outbox?: unknown[] };
        expect(call.outbox).toBeUndefined();
    });

    it('notifies the room', async () => {
        await processPublishMessage(MESSAGE, PUBLISHED_AT + 10);
        expect(notifyBattleRoomIfPresent).toHaveBeenCalledWith('room_1', {
            type: 'battle-updated',
            battleId: 'btl_0001',
            state: 'published',
        });
    });
});

describe('the integrity gate before a receipt is called final', () => {
    it('throws when the stored payload no longer hashes to its own id', async () => {
        // Corruption between signing and storage means the signature over it proves
        // nothing. Catching it here beats a third party finding it first.
        vi.mocked(prisma.battleReceipt.findUnique).mockResolvedValue({
            receiptHash: `0x${'de'.repeat(32)}`,
            payload: WIRE,
        } as never);

        await expect(processPublishMessage(MESSAGE, PUBLISHED_AT + 10)).rejects.toThrow(
            /does not match what was signed/,
        );
        expect(applyTransition).not.toHaveBeenCalled();
    });

    it('throws when the stored payload is not a valid receipt at all', async () => {
        vi.mocked(prisma.battleReceipt.findUnique).mockResolvedValue({
            receiptHash: hashBattleReceipt(RECEIPT),
            payload: { ...WIRE, seed: `0x${'99'.repeat(32)}` },
        } as never);

        await expect(processPublishMessage(MESSAGE, PUBLISHED_AT + 10)).rejects.toThrow();
        expect(applyTransition).not.toHaveBeenCalled();
    });

    it('throws when a signed battle has no receipt row', async () => {
        vi.mocked(prisma.battleReceipt.findUnique).mockResolvedValue(null);
        await expect(processPublishMessage(MESSAGE, PUBLISHED_AT + 10)).rejects.toThrow(/no receipt row/);
    });
});

describe('idempotence', () => {
    it('completes without acting when the battle already moved on', async () => {
        vi.mocked(prisma.battleLedger.findUnique).mockResolvedValue({ ...BATTLE, state: 'batched' } as never);
        await processPublishMessage(MESSAGE, PUBLISHED_AT + 10);
        expect(applyTransition).not.toHaveBeenCalled();
        expect(completeOutbox).toHaveBeenCalled();
    });

    it('completes without acting when the battle no longer exists', async () => {
        vi.mocked(prisma.battleLedger.findUnique).mockResolvedValue(null);
        await processPublishMessage(MESSAGE, PUBLISHED_AT + 10);
        expect(applyTransition).not.toHaveBeenCalled();
        expect(completeOutbox).toHaveBeenCalled();
    });
});
