import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';

// vi.mock factories are hoisted above all top-level `const`s in this file, so shared mock
// state has to live inside vi.hoisted (which itself runs before the hoisted vi.mock calls).
const mocks = vi.hoisted(() => {
    const randomnessCreate = vi.fn();
    const commitIx = vi.fn();
    class MockRandomness {
        static create = randomnessCreate;
        commitIx(...args: unknown[]) { return commitIx(...args); }
    }
    const parseLogs = vi.fn();
    class MockEventParser {
        parseLogs(logs: string[]) { return parseLogs(logs); }
    }
    return {
        fetchNullable: vi.fn(),
        fetchAssetByPetId: vi.fn(),
        sendSignedTx: vi.fn(),
        waitForRevealIx: vi.fn(),
        getDefaultQueue: vi.fn(),
        randomnessCreate,
        commitIx,
        asV0Tx: vi.fn(),
        parseLogs,
        MockRandomness,
        MockEventParser,
    };
});

vi.mock('../../../src/utils/solana/accountClient', () => ({
    getAccountClient: () => ({ fetchNullable: mocks.fetchNullable }),
    fetchAssetByPetId: (...args: unknown[]) => mocks.fetchAssetByPetId(...args),
}));

vi.mock('../../../src/utils/solana/switchboardVrfTx', () => ({
    sendSignedTx: (...args: unknown[]) => mocks.sendSignedTx(...args),
    waitForRevealIx: (...args: unknown[]) => mocks.waitForRevealIx(...args),
    vrfTimingForEndpoint: () => ({ commitRevealWaitMs: 3_000, revealRetries: 5, revealBackoffMs: 2_000 }),
}));

vi.mock('@switchboard-xyz/on-demand', () => ({
    getDefaultQueue: (...args: unknown[]) => mocks.getDefaultQueue(...args),
    Randomness: mocks.MockRandomness,
    asV0Tx: (...args: unknown[]) => mocks.asV0Tx(...args),
}));

vi.mock('@coral-xyz/anchor', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@coral-xyz/anchor')>();
    return {
        ...actual,
        EventParser: mocks.MockEventParser,
    };
});

import { battleWithSwitchboardVrf, type BattleWithVrfArgs } from '../../../src/utils/solana/battleWithSwitchboardVrf';

const PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
const OWNER = new PublicKey('11111111111111111111111111111112');
const DEFENDER_OWNER = new PublicKey('11111111111111111111111111111113');
const ATTACKER_ASSET = new PublicKey('11111111111111111111111111111114');
const DEFENDER_ASSET = new PublicKey('11111111111111111111111111111115');
const RANDOMNESS_ACCOUNT = new PublicKey('11111111111111111111111111111116');

function makeBuilder() {
    const builder = { accounts: vi.fn(), instruction: vi.fn() };
    builder.accounts.mockReturnValue(builder);
    builder.instruction.mockResolvedValue({ programId: PROGRAM_ID, keys: [], data: Buffer.alloc(0) });
    return builder;
}

function makeArgs(overrides: Partial<BattleWithVrfArgs> = {}): BattleWithVrfArgs {
    const settleBuilder = makeBuilder();
    const commitBuilder = makeBuilder();
    const program = {
        programId: PROGRAM_ID,
        coder: {},
        methods: {
            commitBattle: vi.fn(() => commitBuilder),
            settleBattle: vi.fn(() => settleBuilder),
        },
    };
    const connection = {
        rpcEndpoint: 'https://api.devnet.solana.com',
        getTransaction: vi.fn().mockResolvedValue({ meta: { logMessages: [] } }),
    };
    const provider = { connection, wallet: {} };

    return {
        program: program as never,
        provider: provider as never,
        programId: PROGRAM_ID,
        owner: OWNER,
        attackerPetId: 1,
        defenderPetId: 2,
        attackerAssetKey: ATTACKER_ASSET.toBase58(),
        ...overrides,
    };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.fetchAssetByPetId.mockImplementation(async (_program: unknown, petId: number) =>
        (petId === 1 ? ATTACKER_ASSET : DEFENDER_ASSET),
    );
    mocks.sendSignedTx.mockResolvedValue('sig-settle');
    mocks.waitForRevealIx.mockResolvedValue({ programId: PROGRAM_ID, keys: [], data: Buffer.alloc(0) });
    mocks.getDefaultQueue.mockResolvedValue({ program: {}, pubkey: PROGRAM_ID });
    mocks.randomnessCreate.mockResolvedValue([
        { commitIx: (...args: unknown[]) => mocks.commitIx(...args) },
        { programId: PROGRAM_ID, keys: [], data: Buffer.alloc(0) },
    ]);
    mocks.commitIx.mockResolvedValue({ programId: PROGRAM_ID, keys: [], data: Buffer.alloc(0) });
    mocks.asV0Tx.mockResolvedValue({});
    mocks.parseLogs.mockReturnValue([]);
});

afterEach(() => {
    vi.useRealTimers();
});

const pendingRecord = {
    attackerPetId: 1,
    defenderPetId: 2,
    defenderOwner: DEFENDER_OWNER,
    randomnessAccount: RANDOMNESS_ACCOUNT,
};

describe('battleWithSwitchboardVrf — resuming a pending battle', () => {
    it('returns immediately (no reveal/settle sent) when the keeper already settled it', async () => {
        mocks.fetchNullable
            .mockResolvedValueOnce(pendingRecord) // trySettlePendingBattle's own pending check
            .mockResolvedValueOnce(null); // waitForKeeperSettle: gone — keeper settled it

        const result = await battleWithSwitchboardVrf(makeArgs());

        expect(result).toEqual({ sig: '', firstWins: null });
        expect(mocks.sendSignedTx).not.toHaveBeenCalled();
    });

    it('falls back to reveal+settle itself when the keeper never settles within the timeout', async () => {
        mocks.fetchNullable.mockResolvedValue(pendingRecord); // always still pending

        const resultPromise = battleWithSwitchboardVrf(makeArgs());
        await vi.advanceTimersByTimeAsync(60_000);
        const result = await resultPromise;

        expect(mocks.waitForRevealIx).toHaveBeenCalled();
        expect(mocks.sendSignedTx).toHaveBeenCalledTimes(1);
        expect(result.sig).toBe('sig-settle');
    });

    it('bails out gracefully when the keeper settles during the reveal wait, just before the fallback would submit', async () => {
        // waitForKeeperSettle's own loop always sees it still pending (so it times out
        // naturally, not because it noticed a settlement) — the keeper only "wins the race"
        // right as the fallback starts waiting on the oracle reveal, which the final
        // pre-submit check (the fix under test) must catch.
        let keeperSettledDuringReveal = false;
        mocks.fetchNullable.mockImplementation(async () => (keeperSettledDuringReveal ? null : pendingRecord));
        mocks.waitForRevealIx.mockImplementation(async () => {
            keeperSettledDuringReveal = true;
            return { programId: PROGRAM_ID, keys: [], data: Buffer.alloc(0) };
        });

        const resultPromise = battleWithSwitchboardVrf(makeArgs());
        await vi.advanceTimersByTimeAsync(60_000);
        const result = await resultPromise;

        expect(result).toEqual({ sig: '', firstWins: null });
        expect(mocks.sendSignedTx).not.toHaveBeenCalled();
    });
});

describe('battleWithSwitchboardVrf — committing a fresh battle', () => {
    it('commits, then defers to the keeper when it settles in time', async () => {
        mocks.fetchNullable
            .mockResolvedValueOnce(null) // no pending request to resume
            .mockResolvedValueOnce(null); // waitForKeeperSettle: settled immediately

        const args = makeArgs();
        const result = await battleWithSwitchboardVrf(args);

        expect((args.program as unknown as { methods: { commitBattle: ReturnType<typeof vi.fn> } }).methods.commitBattle)
            .toHaveBeenCalledWith(expect.anything());
        expect(mocks.sendSignedTx).toHaveBeenCalledTimes(1); // only the commit tx, no settle tx
        expect(result).toEqual({ sig: '', firstWins: null });
    });

    it('commits, falls back to reveal+settle, and parses firstWins from the settle tx', async () => {
        mocks.fetchNullable
            .mockResolvedValueOnce(null) // no pending request to resume
            .mockResolvedValue({}); // waitForKeeperSettle: never settles, times out

        mocks.parseLogs.mockReturnValue([{ name: 'BattleResolved', data: { firstWins: true } }]);

        const resultPromise = battleWithSwitchboardVrf(makeArgs());
        await vi.advanceTimersByTimeAsync(60_000);
        const result = await resultPromise;

        expect(mocks.sendSignedTx).toHaveBeenCalledTimes(2); // commit tx, then settle tx
        expect(result).toEqual({ sig: 'sig-settle', firstWins: true });
    });
});
