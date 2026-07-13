import { afterEach, describe, expect, it, vi } from 'vitest';

const startKeeperMock = vi.fn();
vi.mock('../../../src/features/settle-keeper/keeper', () => ({
    startKeeper: startKeeperMock,
}));

async function loadWithEnv(settleKeeper: Record<string, unknown>) {
    vi.resetModules();
    vi.doMock('@config/env', () => ({ env: { settleKeeper } }));
    return import('../../../src/features/settle-keeper/index');
}

describe('startSettleKeeper', () => {
    afterEach(() => {
        vi.clearAllMocks();
        vi.doUnmock('@config/env');
    });

    it('no-ops when KEEPER_ENABLED is not set', async () => {
        const { startSettleKeeper } = await loadWithEnv({ enabled: false });
        startSettleKeeper();
        expect(startKeeperMock).not.toHaveBeenCalled();
    });

    it('no-ops and logs when enabled but missing required config', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { startSettleKeeper } = await loadWithEnv({ enabled: true, rpcUrl: undefined });
        startSettleKeeper();
        expect(startKeeperMock).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('keeper disabled'));
        errorSpy.mockRestore();
    });

    it('starts the keeper when enabled with full config', async () => {
        startKeeperMock.mockResolvedValue({ stop: vi.fn() });
        const { startSettleKeeper, stopSettleKeeper } = await loadWithEnv({
            enabled: true,
            rpcUrl: 'http://127.0.0.1:8545',
            privateKey: '0xabc',
            chainId: 31337,
            gameLogicAddress: '0xdead',
            backfillBlocks: 5000n,
            mockReveal: false,
        });

        startSettleKeeper();
        await Promise.resolve(); // let the start promise's .then() run
        expect(startKeeperMock).toHaveBeenCalledWith(
            expect.objectContaining({ rpcUrl: 'http://127.0.0.1:8545', chainId: 31337 }),
        );

        stopSettleKeeper(); // must not throw even with an async start in flight
    });
});
