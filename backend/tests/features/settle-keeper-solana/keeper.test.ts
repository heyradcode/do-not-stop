import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';

// vi.mock factories are hoisted above all top-level `const`s in this file, so any mock
// state they close over has to be built inside vi.hoisted (which itself runs before the
// hoisted vi.mock calls) rather than referenced from an ordinary top-level const.
const mocks = vi.hoisted(() => {
    const settleBattleIxBuilder = { accounts: vi.fn(), instruction: vi.fn() };
    settleBattleIxBuilder.accounts.mockReturnValue(settleBattleIxBuilder);
    const methods = { settleBattle: vi.fn(() => settleBattleIxBuilder) };

    const fetchIdl = vi.fn();
    function ProgramCtor(this: { methods: typeof methods }) {
        this.methods = methods;
    }
    (ProgramCtor as unknown as { fetchIdl: typeof fetchIdl }).fetchIdl = fetchIdl;

    const revealIx = vi.fn();
    class MockRandomness {
        revealIx(...args: unknown[]) { return revealIx(...args); }
    }

    return {
        settleBattleIxBuilder,
        methods,
        fetchIdl,
        ProgramCtor,
        revealIx,
        MockRandomness,
        getDefaultQueue: vi.fn(),
        asV0Tx: vi.fn(),
        getAccountClient: vi.fn(),
        fetchAssetByPetId: vi.fn(),
        sendSignedTx: vi.fn(),
        getBalance: vi.fn(),
    };
});

vi.mock('@solana/web3.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@solana/web3.js')>();
    return {
        ...actual,
        Connection: function ConnectionMock(this: unknown, rpcUrl: string) {
            return { rpcEndpoint: rpcUrl, getBalance: mocks.getBalance };
        },
    };
});

vi.mock('@coral-xyz/anchor', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@coral-xyz/anchor')>();
    return {
        ...actual,
        AnchorProvider: function AnchorProviderMock(this: unknown, connection: unknown, wallet: unknown, opts: unknown) {
            return { connection, wallet, opts };
        },
        Program: mocks.ProgramCtor,
        Wallet: function WalletMock(this: unknown, keypair: Keypair) {
            return { publicKey: keypair.publicKey };
        },
    };
});

vi.mock('@switchboard-xyz/on-demand', () => ({
    getDefaultQueue: mocks.getDefaultQueue,
    Randomness: mocks.MockRandomness,
    asV0Tx: mocks.asV0Tx,
}));

vi.mock('@shared/core/node', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@shared/core/node')>();
    return {
        ...actual,
        getAccountClient: mocks.getAccountClient,
        fetchAssetByPetId: mocks.fetchAssetByPetId,
        globalStatePda: () => ['global-state-pda', 1],
        petPdaByAsset: () => ['pet-pda', 1],
        sendSignedTx: mocks.sendSignedTx,
    };
});

import { startSolanaSettleKeeper, type SolanaSettleKeeperConfig } from '../../../src/features/settle-keeper-solana/keeper';

const {
    settleBattleIxBuilder, methods, fetchIdl, revealIx, getDefaultQueue, asV0Tx,
    getAccountClient, fetchAssetByPetId, sendSignedTx, getBalance,
} = mocks;

const originalSettleBattle = methods.settleBattle;

const ZERO_KEY = new PublicKey('11111111111111111111111111111111');
const BATTLE_REQUEST_KEY = new PublicKey('11111111111111111111111111111112');
const ATTACKER_ASSET = new PublicKey('11111111111111111111111111111113');
const DEFENDER_ASSET = new PublicKey('11111111111111111111111111111114');

const rawAccount = {
    attackerOwner: ZERO_KEY,
    defenderOwner: ZERO_KEY,
    attackerPetId: 1,
    defenderPetId: 2,
    randomnessAccount: ZERO_KEY,
};

const baseConfig: SolanaSettleKeeperConfig = {
    rpcUrl: 'http://127.0.0.1:8899',
    keypair: Keypair.generate(),
    programId: ZERO_KEY,
    pollIntervalMs: 5_000,
};

/** Flush the microtask chain so an in-flight (unawaited) `void tick()` settles — deep
 *  enough for several sequentially-awaited trySettle calls within one tick. */
async function flush(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    methods.settleBattle = originalSettleBattle;
    fetchIdl.mockResolvedValue({ instructions: [] });
    settleBattleIxBuilder.accounts.mockReturnValue(settleBattleIxBuilder);
    settleBattleIxBuilder.instruction.mockResolvedValue({ programId: ZERO_KEY, keys: [], data: Buffer.alloc(0) });
    getDefaultQueue.mockResolvedValue({ program: {} });
    asV0Tx.mockResolvedValue({});
    sendSignedTx.mockResolvedValue('sig123');
    fetchAssetByPetId.mockImplementation(async (_program: unknown, petId: number) =>
        (petId === 1 ? ATTACKER_ASSET : DEFENDER_ASSET),
    );
    getAccountClient.mockReturnValue({
        all: vi.fn().mockResolvedValue([{ publicKey: BATTLE_REQUEST_KEY, account: rawAccount }]),
    });
    revealIx.mockResolvedValue({ programId: ZERO_KEY, keys: [], data: Buffer.alloc(0) });
    getBalance.mockResolvedValue(1_000_000_000); // 1 SOL, well above MIN_BALANCE_LAMPORTS
});

afterEach(() => {
    vi.useRealTimers();
});

describe('startSolanaSettleKeeper', () => {
    it('refuses to start with a clear error when the fetched IDL has no settleBattle instruction', async () => {
        delete (methods as Partial<typeof methods>).settleBattle;

        await expect(startSolanaSettleKeeper(baseConfig)).rejects.toThrow(/no settleBattle instruction/);
    });

    it('settles an open battle request once Switchboard has revealed', async () => {
        const handle = await startSolanaSettleKeeper(baseConfig);
        await flush();

        expect(settleBattleIxBuilder.accounts).toHaveBeenCalledWith(
            expect.objectContaining({
                battleRequest: BATTLE_REQUEST_KEY,
                attackerAsset: ATTACKER_ASSET,
                defenderAsset: DEFENDER_ASSET,
            }),
        );
        expect(sendSignedTx).toHaveBeenCalled();
        handle.stop();
    });

    it('does not settle yet when Switchboard has not revealed, and retries successfully next tick', async () => {
        revealIx.mockRejectedValueOnce(new Error('not ready'));

        const handle = await startSolanaSettleKeeper(baseConfig);
        await flush();
        expect(sendSignedTx).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(baseConfig.pollIntervalMs);
        expect(sendSignedTx).toHaveBeenCalled();
        handle.stop();
    });

    it('logs and skips when pet asset lookup fails', async () => {
        fetchAssetByPetId.mockRejectedValue(new Error('rpc down'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const handle = await startSolanaSettleKeeper(baseConfig);
        await flush();

        expect(sendSignedTx).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('failed to look up pet assets'));
        errorSpy.mockRestore();
        handle.stop();
    });

    it('logs and skips when a pet asset is not found', async () => {
        fetchAssetByPetId.mockResolvedValue(null);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const handle = await startSolanaSettleKeeper(baseConfig);
        await flush();

        expect(sendSignedTx).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('asset not found'));
        errorSpy.mockRestore();
        handle.stop();
    });

    it('fetches the Switchboard queue once per tick, not once per pending request', async () => {
        const secondRequestKey = new PublicKey('11111111111111111111111111111115');
        getAccountClient.mockReturnValue({
            all: vi.fn().mockResolvedValue([
                { publicKey: BATTLE_REQUEST_KEY, account: rawAccount },
                { publicKey: secondRequestKey, account: rawAccount },
            ]),
        });

        const handle = await startSolanaSettleKeeper(baseConfig);
        await flush();

        expect(sendSignedTx).toHaveBeenCalledTimes(2); // both requests settled...
        expect(getDefaultQueue).toHaveBeenCalledTimes(1); // ...off a single queue fetch
        handle.stop();
    });

    it('stop() halts further polling', async () => {
        const handle = await startSolanaSettleKeeper(baseConfig);
        await flush();
        const allMock = getAccountClient.mock.results[0]!.value.all as ReturnType<typeof vi.fn>;
        const callsBefore = allMock.mock.calls.length;

        handle.stop();
        await vi.advanceTimersByTimeAsync(baseConfig.pollIntervalMs * 3);

        expect(allMock.mock.calls.length).toBe(callsBefore);
    });

    it('warns when the keeper wallet balance is below the minimum threshold', async () => {
        getBalance.mockResolvedValue(1); // effectively empty
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const handle = await startSolanaSettleKeeper(baseConfig);
        await flush();

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('balance is low'));
        errorSpy.mockRestore();
        handle.stop();
    });

    it('does not warn when the keeper wallet balance is sufficient', async () => {
        getBalance.mockResolvedValue(1_000_000_000); // 1 SOL
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const handle = await startSolanaSettleKeeper(baseConfig);
        await flush();

        expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('balance is low'));
        errorSpy.mockRestore();
        handle.stop();
    });

    it('re-checks the wallet balance periodically', async () => {
        const handle = await startSolanaSettleKeeper(baseConfig);
        await flush();
        const callsBefore = getBalance.mock.calls.length;

        await vi.advanceTimersByTimeAsync(10 * 60_000);

        expect(getBalance.mock.calls.length).toBeGreaterThan(callsBefore);
        handle.stop();
    });
});
