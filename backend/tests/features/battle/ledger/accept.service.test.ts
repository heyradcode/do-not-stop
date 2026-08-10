import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashBattleSnapshot, QUICKNET, roundTime } from '@cryptopets/protocol';

vi.mock('@config/env', () => ({
    env: { battle: { deploymentId: 'base-sepolia-live', chainIds: ['eip155:84532'] } },
}));

vi.mock('@config/prisma', () => ({
    prisma: {
        battleIntent: { findUnique: vi.fn() },
        battleRuleset: { findUnique: vi.fn(), create: vi.fn() },
        battleCommitment: { findFirst: vi.fn() },
    },
}));

// The catalog join is covered in ruleset.builder's own test; stubbed to the source
// default here so these stay about what accept does, not about how a ruleset is assembled.
vi.mock('../../../../src/features/battle/ledger/ruleset.builder', async () => {
    const { SOURCE_DEFAULT_RULESET } = await vi.importActual<typeof import('@cryptopets/protocol')>(
        '@cryptopets/protocol',
    );
    return { servedRuleset: vi.fn(async () => SOURCE_DEFAULT_RULESET) };
});

vi.mock('../../../../src/features/battle/ledger/snapshot.builder', () => ({
    buildPetSnapshot: vi.fn(),
}));

vi.mock('../../../../src/features/battle/ledger/consent.service', () => ({
    findCoveringAuthorization: vi.fn(),
    consumeDailyBudget: vi.fn(),
}));

vi.mock('../../../../src/features/battle/randomness', () => ({
    chooseCommitmentRound: vi.fn(),
    roundPublishTime: vi.fn((round: number) => new Date(roundTime(QUICKNET, round) * 1000)),
}));

vi.mock('../../../../src/features/battle/signer', () => ({
    activeSigningKey: vi.fn(),
    sign: vi.fn(),
    SignerRefusedError: class SignerRefusedError extends Error {
        constructor(
            public reason: string,
            detail: string,
        ) {
            super(detail);
        }
    },
}));

vi.mock('../../../../src/features/battle/ledger/transitions', () => ({
    openBattle: vi.fn(),
    applyTransition: vi.fn(),
}));

import { prisma } from '@config/prisma';
import { acceptBattle, decodeStoredSnapshot } from '@features/battle/ledger';
import { chooseCommitmentRound, roundPublishTime } from '@features/battle/randomness';
import { activeSigningKey, sign, SignerRefusedError } from '@features/battle/signer';
import { consumeDailyBudget, findCoveringAuthorization } from '../../../../src/features/battle/ledger/consent.service';
import { buildPetSnapshot } from '../../../../src/features/battle/ledger/snapshot.builder';
import { applyTransition, openBattle } from '../../../../src/features/battle/ledger/transitions';

const ROUND_1000_TIME = roundTime(QUICKNET, 1000);
const NOW = ROUND_1000_TIME + 1;

const ATTACKER = {
    petId: 1n,
    owner: '0xabcdef0123456789abcdef0123456789abcdef01',
    dna: 1234567890123456n,
    rarity: 3,
    level: 10,
    skill: 4,
    xp: 120,
    lastOpponentId: 0n,
    streak: 0,
    readyAt: NOW - 100,
    sourceVersion: BigInt(NOW - 50),
};

const DEFENDER = {
    ...ATTACKER,
    petId: 2n,
    owner: '0x2222222222222222222222222222222222222222',
    lastOpponentId: 1n,
    streak: 2,
};

const INTENT = {
    intentHash: '0xaa'.padEnd(66, '1'),
    chainId: 'eip155:84532',
    deploymentId: 'base-sepolia-live',
    attackerPetId: '1',
    defenderPetId: '2',
    consumedAt: null as Date | null,
    expiresAt: BigInt(NOW + 300),
};

const SIGNING_KEY = {
    keyId: 'battle-signer-test',
    algorithm: 'secp256k1' as const,
    publicKey: `0x${'04'.repeat(64)}` as const,
    address: `0x${'ab'.repeat(20)}` as const,
    notBefore: NOW - 1000,
    notAfter: null,
    status: 'active' as const,
};

function baseline() {
    vi.mocked(prisma.battleIntent.findUnique).mockResolvedValue(INTENT as never);
    vi.mocked(prisma.battleRuleset.findUnique).mockResolvedValue({} as never);
    vi.mocked(prisma.battleCommitment.findFirst).mockResolvedValue(null);
    vi.mocked(buildPetSnapshot).mockImplementation((async (_chainId: string, petId: string) =>
        petId === '1' ? ATTACKER : DEFENDER) as never);
    vi.mocked(findCoveringAuthorization).mockResolvedValue({
        ok: true,
        authorizationHash: '0xauth'.padEnd(66, '2'),
        maxBattlesPerDay: 20,
    } as never);
    vi.mocked(consumeDailyBudget).mockResolvedValue({ ok: true, used: 1 });
    vi.mocked(chooseCommitmentRound).mockResolvedValue({ ok: true, round: 1002, latestVerified: 1000 });
    vi.mocked(activeSigningKey).mockReturnValue(SIGNING_KEY as never);
    vi.mocked(openBattle).mockImplementation((async (req: { ledger: { battleId: string } }) => ({
        ok: true,
        battleId: req.ledger.battleId,
    })) as never);
    vi.mocked(sign).mockImplementation((async (request: { kind: string }) => ({
        kind: request.kind,
        digest: '0xdigest'.padEnd(66, '3'),
        signature: '0xsig'.padEnd(132, '4'),
        keyId: SIGNING_KEY.keyId,
    })) as never);
    vi.mocked(applyTransition).mockImplementation((async (req: { onApplied?: (tx: unknown) => Promise<void> }) => {
        if (req.onApplied) {
            await req.onApplied(fakeTx());
        }
        return { applied: true, state: 'committed' };
    }) as never);
}

/** A minimal stand-in for the Prisma transaction client `onApplied` writes through. */
function fakeTx() {
    return { battleCommitment: { create: vi.fn().mockResolvedValue({}) } };
}

beforeEach(() => {
    vi.clearAllMocks();
    baseline();
});

describe('the happy path', () => {
    it('accepts, commits to a future round, and returns the signed commitment synchronously', async () => {
        const result = await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.battle.commitment.drandRound).toBe(1002);
            expect(result.battle.commitment.drandChainHash).toBe(QUICKNET.chainHash);
            expect(result.battle.signature).toMatch(/^0xsig/);
            expect(result.battle.commitmentHash).toMatch(/^0xdigest/);
        }
    });

    it('never returns a round that has already published', async () => {
        // The property the whole design rests on, checked here at the orchestration level too,
        // not just inside protocol's own validation.
        const result = await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(roundTime(QUICKNET, result.battle.commitment.drandRound)).toBeGreaterThan(NOW);
        }
    });

    it('chooses the round and opens the ledger before ever asking the signer', async () => {
        // Ordering matters: a battle must never be accepted (nor an intent consumed) over a
        // round choice that could still turn out to be unobtainable.
        await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW });

        const roundCallOrder = vi.mocked(chooseCommitmentRound).mock.invocationCallOrder[0]!;
        const openCallOrder = vi.mocked(openBattle).mock.invocationCallOrder[0]!;
        const signCallOrder = vi.mocked(sign).mock.invocationCallOrder[0]!;
        expect(roundCallOrder).toBeLessThan(openCallOrder);
        expect(openCallOrder).toBeLessThan(signCallOrder);
    });

    it('schedules the await-beacon outbox message for when the round actually publishes', async () => {
        await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW });
        expect(roundPublishTime).toHaveBeenCalledWith(1002);
        const call = vi.mocked(applyTransition).mock.calls[0]![0] as { outbox: { availableAt: Date }[] };
        expect(call.outbox[0]!.availableAt.getTime()).toBe(roundTime(QUICKNET, 1002) * 1000);
    });

    it('publishes the active ruleset the first time it is referenced', async () => {
        vi.mocked(prisma.battleRuleset.findUnique).mockResolvedValue(null);
        await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW });
        expect(prisma.battleRuleset.create).toHaveBeenCalledTimes(1);
    });

    it('does not republish an already-published ruleset', async () => {
        await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW });
        expect(prisma.battleRuleset.create).not.toHaveBeenCalled();
    });
});

describe('intent checks', () => {
    it('rejects an unknown intent', async () => {
        vi.mocked(prisma.battleIntent.findUnique).mockResolvedValue(null);
        expect(await acceptBattle({ intentHash: '0xmissing', nowSeconds: NOW })).toMatchObject({
            ok: false,
            reason: 'intent-not-found',
        });
    });

    it('rejects an already-consumed intent without touching the pet snapshots', async () => {
        vi.mocked(prisma.battleIntent.findUnique).mockResolvedValue({ ...INTENT, consumedAt: new Date() } as never);
        const result = await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW });
        expect(result).toMatchObject({ ok: false, reason: 'intent-already-consumed' });
        expect(buildPetSnapshot).not.toHaveBeenCalled();
    });

    it('rejects an expired intent', async () => {
        const result = await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: Number(INTENT.expiresAt) });
        expect(result).toMatchObject({ ok: false, reason: 'intent-expired' });
    });
});

describe('pet checks', () => {
    it('rejects when the attacker pet is missing from the roster', async () => {
        vi.mocked(buildPetSnapshot).mockImplementation((async (_chainId: string, petId: string) =>
            petId === '1' ? null : DEFENDER) as never);
        expect(await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW })).toMatchObject({
            ok: false,
            reason: 'attacker-pet-missing',
        });
    });

    it('rejects when either pet is on cooldown, mirroring GameLogic requiring both pets ready', async () => {
        vi.mocked(buildPetSnapshot).mockImplementation((async (_chainId: string, petId: string) =>
            petId === '1' ? { ...ATTACKER, readyAt: NOW + 100 } : DEFENDER) as never);
        expect(await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW })).toMatchObject({
            ok: false,
            reason: 'attacker-not-ready',
        });

        vi.mocked(buildPetSnapshot).mockImplementation((async (_chainId: string, petId: string) =>
            petId === '1' ? ATTACKER : { ...DEFENDER, readyAt: NOW + 100 }) as never);
        expect(await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW })).toMatchObject({
            ok: false,
            reason: 'defender-not-ready',
        });
    });
});

describe('consent and budget', () => {
    it('passes through the consent-coverage failure reason unchanged', async () => {
        vi.mocked(findCoveringAuthorization).mockResolvedValue({
            ok: false,
            reason: 'attacker-level-below-band',
            detail: 'too low',
        });
        expect(await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW })).toMatchObject({
            ok: false,
            reason: 'attacker-level-below-band',
        });
    });

    it('rejects once the daily cap is reached, without ever opening a battle', async () => {
        vi.mocked(consumeDailyBudget).mockResolvedValue({ ok: false, reason: 'daily-cap-reached' });
        const result = await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW });
        expect(result).toMatchObject({ ok: false, reason: 'daily-cap-reached' });
        expect(openBattle).not.toHaveBeenCalled();
    });
});

describe('drand unavailability', () => {
    it('fails closed rather than accepting without a committed round', async () => {
        vi.mocked(chooseCommitmentRound).mockResolvedValue({ ok: false, detail: 'all endpoints down' });
        const result = await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW });
        expect(result).toMatchObject({ ok: false, reason: 'drand-unavailable' });
        // Nothing was opened or consumed: a battle should never be accepted over a round choice
        // that turned out to be unobtainable.
        expect(openBattle).not.toHaveBeenCalled();
        expect(consumeDailyBudget).not.toHaveBeenCalled();
    });
});

describe('opening the ledger', () => {
    it('reports a locked pet as its own reason', async () => {
        vi.mocked(openBattle).mockResolvedValue({ ok: false, reason: 'pet-locked', petId: '2' });
        expect(await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW })).toMatchObject({
            ok: false,
            reason: 'pet-locked',
        });
        expect(sign).not.toHaveBeenCalled();
    });

    it('locks both pets, in numeric order, and consumes the originating intent atomically', async () => {
        await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW });
        const call = vi.mocked(openBattle).mock.calls[0]![0];
        expect(call.petIds).toEqual(['1', '2']);
        expect(call.consumeIntentHash).toBe(INTENT.intentHash);
    });

    it('persists the frozen snapshot before any randomness for the battle exists', async () => {
        // §J: the photo has to be durable before the commitment step even starts.
        await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW });
        const ledger = vi.mocked(openBattle).mock.calls[0]![0].ledger as { snapshotHash: string; drandRound: bigint };
        expect(typeof ledger.snapshotHash).toBe('string');
        expect(ledger.drandRound).toBe(0n);
    });
});

describe('the stored snapshot survives a storage round trip', () => {
    /**
     * The property every worker downstream depends on: what acceptance persisted, read back
     * through `decodeStoredSnapshot`, still hashes to the `snapshotHash` acceptance
     * committed. The seed is derived from that hash and `assertBattleReceipt` re-derives it
     * from the receipt's own snapshot, so a decoder that loses any field stops every battle
     * at signing.
     *
     * Written as a property rather than as an assertion about `schemaVersion` and
     * `equipment` specifically, because those are only the two fields that have been lost
     * so far. Any field added to `PetSnapshot` is covered here on the day it is added.
     */
    async function storedLedger() {
        await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW });
        return vi.mocked(openBattle).mock.calls[0]![0].ledger as unknown as {
            snapshot: unknown;
            snapshotHash: string;
        };
    }

    it('rehashes to the committed snapshotHash', async () => {
        const ledger = await storedLedger();
        expect(hashBattleSnapshot(decodeStoredSnapshot(ledger.snapshot))).toBe(ledger.snapshotHash);
    });

    it('rehashes to the committed snapshotHash with equipment', async () => {
        vi.mocked(buildPetSnapshot).mockImplementation((async (_chainId: string, petId: string) =>
            petId === '1'
                ? { ...ATTACKER, equipment: [{ slot: 0, itemType: 3n, hp: 0, atk: 22, def: 0, int: 0, mdef: 0 }] }
                : DEFENDER) as never);

        const ledger = await storedLedger();
        expect(hashBattleSnapshot(decodeStoredSnapshot(ledger.snapshot))).toBe(ledger.snapshotHash);
    });
});

describe('signer failure unwinds the accepted row', () => {
    it('moves the ledger to rejected and reports signer-unavailable', async () => {
        vi.mocked(sign).mockRejectedValue(new SignerRefusedError('signer-not-configured', 'no key'));

        const result = await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW });

        expect(result).toMatchObject({ ok: false, reason: 'signer-unavailable' });
        const rejectedBattleId = vi.mocked(openBattle).mock.calls[0]![0].ledger.battleId as string;
        expect(applyTransition).toHaveBeenCalledWith(
            expect.objectContaining({ battleId: rejectedBattleId, from: 'accepted', to: 'rejected' }),
        );
    });

    it('propagates an unexpected error rather than swallowing it as a rejection', async () => {
        vi.mocked(sign).mockRejectedValue(new Error('kms unreachable'));
        await expect(acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW })).rejects.toThrow(
            /kms unreachable/,
        );
    });
});

describe('commitment chain-position retry', () => {
    it('retries with a fresh chain head when another accept call wins the position first', async () => {
        vi.mocked(prisma.battleCommitment.findFirst)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ commitmentHash: '0xhead'.padEnd(66, '5'), sequence: 1n } as never);
        vi.mocked(applyTransition)
            .mockImplementationOnce((async () => {
                throw Object.assign(new Error('unique'), { code: 'P2002' });
            }) as never)
            .mockImplementationOnce((async (req: { onApplied?: (tx: unknown) => Promise<void> }) => {
                if (req.onApplied) await req.onApplied(fakeTx());
                return { applied: true, state: 'committed' };
            }) as never);

        const result = await acceptBattle({ intentHash: INTENT.intentHash, nowSeconds: NOW });

        expect(result.ok).toBe(true);
        expect(sign).toHaveBeenCalledTimes(2);
        expect(applyTransition).toHaveBeenCalledTimes(2);
    });
});
