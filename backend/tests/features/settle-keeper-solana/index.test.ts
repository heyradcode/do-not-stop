import { afterEach, describe, expect, it, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';

const startSolanaSettleKeeperMock = vi.fn();
vi.mock('../../../src/features/settle-keeper-solana/keeper', () => ({
    startSolanaSettleKeeper: startSolanaSettleKeeperMock,
}));

async function loadWithEnv(solanaSettleKeeper: Record<string, unknown>) {
    vi.resetModules();
    vi.doMock('@config/env', () => ({ env: { solanaSettleKeeper } }));
    return import('../../../src/features/settle-keeper-solana/index');
}

const validKeypairJson = JSON.stringify(Array.from(Keypair.generate().secretKey));

describe('startSolanaSettleKeeperFeature', () => {
    afterEach(() => {
        vi.clearAllMocks();
        vi.doUnmock('@config/env');
    });

    it('no-ops when KEEPER_SOLANA_ENABLED is not set', async () => {
        const { startSolanaSettleKeeperFeature } = await loadWithEnv({ enabled: false });
        startSolanaSettleKeeperFeature();
        expect(startSolanaSettleKeeperMock).not.toHaveBeenCalled();
    });

    it('no-ops and logs when enabled but missing required config', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { startSolanaSettleKeeperFeature } = await loadWithEnv({ enabled: true, rpcUrl: undefined });
        startSolanaSettleKeeperFeature();
        expect(startSolanaSettleKeeperMock).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('keeper disabled'));
        errorSpy.mockRestore();
    });

    it('no-ops and logs when the keypair JSON is invalid', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { startSolanaSettleKeeperFeature } = await loadWithEnv({
            enabled: true,
            rpcUrl: 'http://127.0.0.1:8899',
            keypairJson: 'not-json',
            programId: '11111111111111111111111111111111',
            pollIntervalMs: 5000,
        });
        startSolanaSettleKeeperFeature();
        expect(startSolanaSettleKeeperMock).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('invalid KEEPER_SOLANA_KEYPAIR'));
        errorSpy.mockRestore();
    });

    it('starts the keeper when enabled with full, valid config', async () => {
        startSolanaSettleKeeperMock.mockResolvedValue({ stop: vi.fn() });
        const { startSolanaSettleKeeperFeature, stopSolanaSettleKeeperFeature } = await loadWithEnv({
            enabled: true,
            rpcUrl: 'http://127.0.0.1:8899',
            keypairJson: validKeypairJson,
            programId: '11111111111111111111111111111111',
            pollIntervalMs: 5000,
        });

        startSolanaSettleKeeperFeature();
        await Promise.resolve(); // let the start promise's .then() run
        expect(startSolanaSettleKeeperMock).toHaveBeenCalledWith(
            expect.objectContaining({ rpcUrl: 'http://127.0.0.1:8899', pollIntervalMs: 5000 }),
        );

        stopSolanaSettleKeeperFeature(); // must not throw even with an async start in flight
    });
});
