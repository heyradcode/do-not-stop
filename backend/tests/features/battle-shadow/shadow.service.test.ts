import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashRuleset, SOURCE_DEFAULT_RULESET, simulate } from '@cryptopets/protocol';

vi.mock('@config/prisma', () => ({
    prisma: {
        battleShadowRun: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn(), groupBy: vi.fn() },
    },
}));
vi.mock('@grpc-client/verifyBattle', () => ({ callVerifyBattle: vi.fn() }));

import { prisma } from '@config/prisma';
import { observeOnSettle, predictOnReveal, resetShadowCounters, shadowCounters } from '@features/battle-shadow';
import { callVerifyBattle } from '@grpc-client/verifyBattle';

const INPUTS = {
    dna1: 1234567890123456n,
    rarity1: 3,
    level1: 10,
    skill1: 4,
    dna2: 6543210987654321n,
    rarity2: 2,
    level2: 11,
    skill2: 7,
};
const SEED = 0x1234n;

/** The outcome the real engine produces for these inputs — never a hand-written guess. */
const EXPECTED = simulate(
    INPUTS.dna1, INPUTS.rarity1, INPUTS.level1, INPUTS.skill1,
    INPUTS.dna2, INPUTS.rarity2, INPUTS.level2, INPUTS.skill2,
    SEED, SOURCE_DEFAULT_RULESET.skillConfig,
);

const PREDICT_REQUEST = {
    chainId: '84532',
    requestId: 77n,
    petId1: 1n,
    petId2: 2n,
    seed: SEED,
    inputs: INPUTS,
    skillConfig: SOURCE_DEFAULT_RULESET.skillConfig,
};

function predictedFromEngine() {
    return {
        firstWins: EXPECTED.result.firstWins,
        rounds: EXPECTED.result.rounds,
        winnerHpRemaining: EXPECTED.result.winnerHpRemaining,
        winnerPetId: EXPECTED.result.firstWins ? '1' : '2',
        loserPetId: EXPECTED.result.firstWins ? '2' : '1',
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    resetShadowCounters();
    vi.mocked(callVerifyBattle).mockResolvedValue({
        ok: true,
        response: {
            firstWins: EXPECTED.result.firstWins,
            rounds: EXPECTED.result.rounds,
            winnerHpRemaining: EXPECTED.result.winnerHpRemaining,
        } as never,
    });
});

describe('predictOnReveal', () => {
    it('records the real engine outcome for the frozen inputs', async () => {
        await predictOnReveal(PREDICT_REQUEST);

        const call = vi.mocked(prisma.battleShadowRun.upsert).mock.calls[0]![0] as {
            create: { predicted: unknown; seed: string; status: string };
        };
        expect(call.create.predicted).toEqual(predictedFromEngine());
        expect(call.create.status).toBe('pending');
        expect(call.create.seed).toBe(`0x${SEED.toString(16).padStart(64, '0')}`);
    });

    it('asks indexer-go for an independent recomputation and stores its verdict', async () => {
        await predictOnReveal(PREDICT_REQUEST);

        expect(callVerifyBattle).toHaveBeenCalledTimes(1);
        const call = vi.mocked(prisma.battleShadowRun.upsert).mock.calls[0]![0] as {
            create: { goVerdict: { status: string; outcome: unknown } };
        };
        expect(call.create.goVerdict.status).toBe('ok');
        expect(call.create.goVerdict.outcome).toMatchObject({ rounds: EXPECTED.result.rounds });
    });

    it('records why Go was unavailable rather than pretending it agreed', async () => {
        // Nothing is being signed here, so an unreachable verifier costs the run its second
        // opinion, not the whole observation — but it must not read as agreement.
        vi.mocked(callVerifyBattle).mockResolvedValue({ ok: false, reason: 'not-configured', detail: 'no addr' });
        await predictOnReveal(PREDICT_REQUEST);

        const call = vi.mocked(prisma.battleShadowRun.upsert).mock.calls[0]![0] as {
            create: { goVerdict: { status: string; outcome?: unknown } };
        };
        expect(call.create.goVerdict.status).toBe('not-configured');
        expect(call.create.goVerdict.outcome).toBeUndefined();
    });

    it('never overwrites an existing prediction on a repeated reveal', async () => {
        // The first prediction is the honest record of what the engine said before the
        // chain answered; a second one could be written after the fact.
        await predictOnReveal(PREDICT_REQUEST);
        const call = vi.mocked(prisma.battleShadowRun.upsert).mock.calls[0]![0] as { update: object };
        expect(call.update).toEqual({});
    });

    it('swallows a database failure rather than disturbing a real settle', async () => {
        vi.mocked(prisma.battleShadowRun.upsert).mockRejectedValue(new Error('db down'));
        await expect(predictOnReveal(PREDICT_REQUEST)).resolves.toBeUndefined();
    });
});

describe('observeOnSettle', () => {
    const storedRun = {
        predicted: predictedFromEngine(),
        goVerdict: { status: 'ok', outcome: { ...EXPECTED.result, firstWins: EXPECTED.result.firstWins } },
        observedAt: null,
    };

    beforeEach(() => {
        vi.mocked(prisma.battleShadowRun.findUnique).mockResolvedValue(storedRun as never);
    });

    it('marks a matching battle as agreed', async () => {
        await observeOnSettle({ chainId: '84532', requestId: 77n, observed: predictedFromEngine() });

        const call = vi.mocked(prisma.battleShadowRun.update).mock.calls[0]![0] as {
            data: { status: string; mismatches: string[] };
        };
        expect(call.data.status).toBe('agreed');
        expect(call.data.mismatches).toEqual([]);
        expect(shadowCounters().agreed).toBe(1);
    });

    it('records a mismatch when the chain disagrees', async () => {
        await observeOnSettle({
            chainId: '84532',
            requestId: 77n,
            observed: { ...predictedFromEngine(), rounds: EXPECTED.result.rounds + 1 },
        });

        const call = vi.mocked(prisma.battleShadowRun.update).mock.calls[0]![0] as {
            data: { status: string; mismatches: string[] };
        };
        expect(call.data.status).toBe('mismatch');
        expect(call.data.mismatches.join(' ')).toContain('rounds');
        expect(shadowCounters().mismatch).toBe(1);
    });

    it('does nothing when the reveal was never predicted', async () => {
        // Inventing a prediction from post-settle state would compare the engine to itself.
        vi.mocked(prisma.battleShadowRun.findUnique).mockResolvedValue(null);
        await observeOnSettle({ chainId: '84532', requestId: 77n, observed: predictedFromEngine() });
        expect(prisma.battleShadowRun.update).not.toHaveBeenCalled();
    });

    it('ignores a re-emitted log for a run already observed', async () => {
        vi.mocked(prisma.battleShadowRun.findUnique).mockResolvedValue({
            ...storedRun,
            observedAt: new Date(),
        } as never);

        await observeOnSettle({ chainId: '84532', requestId: 77n, observed: predictedFromEngine() });

        expect(prisma.battleShadowRun.update).not.toHaveBeenCalled();
        expect(shadowCounters().agreed).toBe(0);
    });

    it('swallows a database failure rather than throwing into the keeper', async () => {
        vi.mocked(prisma.battleShadowRun.findUnique).mockRejectedValue(new Error('db down'));
        await expect(
            observeOnSettle({ chainId: '84532', requestId: 77n, observed: predictedFromEngine() }),
        ).resolves.toBeUndefined();
    });
});
