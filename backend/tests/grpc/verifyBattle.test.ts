import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const verifyBattleMock = vi.hoisted(() => vi.fn());
const envMock = vi.hoisted(() => ({
    indexerGrpc: { addr: 'localhost:50051' as string | undefined, protoPath: undefined },
}));

vi.mock('@config/env', () => ({ env: envMock }));

vi.mock('../../src/grpc/gameData', () => ({
    loadGameDataService: () =>
        class {
            verifyBattle = verifyBattleMock;
        },
}));

import { callVerifyBattle, resetVerifyBattleClient } from '../../src/grpc/verifyBattle';

const PARAMS = {
    attacker: { petId: '1', dna: '1234567890123456', rarity: 3, level: 10, skill: 4, xp: 0, lastOpponentId: '0', streak: 0 },
    defender: { petId: '2', dna: '6543210987654321', rarity: 2, level: 11, skill: 7, xp: 0, lastOpponentId: '0', streak: 0 },
    seed: `0x${'ab'.repeat(32)}`,
    skillConfig: {
        tankHpMult: 120,
        shellDefMult: 125,
        swiftCritBonus: 50,
        cunningCritCap: 4000,
        furyDmgMult: 130,
        furyHpThreshold: 3000,
        sageMdefMult: 125,
        bloodlustBps: 150,
    },
    maxLevel: 100,
};

beforeEach(() => {
    vi.clearAllMocks();
    resetVerifyBattleClient();
    envMock.indexerGrpc.addr = 'localhost:50051';
});

afterEach(() => {
    resetVerifyBattleClient();
});

describe('fail-closed by contract', () => {
    it('reports not-configured rather than resolving as if verification passed', async () => {
        envMock.indexerGrpc.addr = undefined;
        const result = await callVerifyBattle(PARAMS);
        expect(result).toMatchObject({ ok: false, reason: 'not-configured' });
        expect(verifyBattleMock).not.toHaveBeenCalled();
    });

    it('surfaces a transport error as a failure, never as a silent pass', async () => {
        verifyBattleMock.mockImplementation((_req, _opts, cb) => cb({ message: 'deadline exceeded' }, null));
        const result = await callVerifyBattle(PARAMS);
        expect(result).toMatchObject({ ok: false, reason: 'transport-error', detail: 'deadline exceeded' });
    });

    it('opens the breaker after repeated failures and still reports a failure, not a pass', async () => {
        verifyBattleMock.mockImplementation((_req, _opts, cb) => cb({ message: 'down' }, null));
        await callVerifyBattle(PARAMS);
        await callVerifyBattle(PARAMS);
        await callVerifyBattle(PARAMS);

        const result = await callVerifyBattle(PARAMS);
        expect(result).toMatchObject({ ok: false, reason: 'breaker-open' });
        // The breaker being open must not translate into fewer gRPC attempts being treated
        // as a pass: only 3 real attempts happened, this 4th was skipped and still failed.
        expect(verifyBattleMock).toHaveBeenCalledTimes(3);
    });
});

describe('a successful call', () => {
    it('resolves ok with the response and encodes the seed as raw bytes', async () => {
        verifyBattleMock.mockImplementation((req, _opts, cb) => {
            expect(req.seed).toBeInstanceOf(Buffer);
            expect((req.seed as Buffer).length).toBe(32);
            cb(null, { firstWins: true, rounds: 5, winnerHpRemaining: 100, log: [], attacker: {}, defender: {} });
        });
        const result = await callVerifyBattle(PARAMS);
        expect(result).toMatchObject({ ok: true });
    });
});
