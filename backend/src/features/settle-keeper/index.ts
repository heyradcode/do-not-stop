import { env } from '@config/env';
import { startKeeper, type SettleKeeperHandle } from './keeper';

/**
 * Settles GameLogic battle/breed/mint requests from a backend-held wallet the
 * moment Pyth Entropy reveals, so the player never has to send the second
 * (settle) transaction themselves. See docs/plan-realtime-battle-ux.md and
 * docs/plan-realtime-battle-impl.md Phase 2.
 *
 * Off unless KEEPER_ENABLED=true, mirroring the indexer-go gRPC stream
 * (src/grpc/battleStream.ts): the feature simply doesn't start rather than
 * failing, so local dev / CI without a configured keeper wallet is unaffected.
 */

let handle: SettleKeeperHandle | null = null;

export function startSettleKeeper(): void {
    if (!env.settleKeeper.enabled) {
        console.log('[settle-keeper] KEEPER_ENABLED not set; keeper disabled');
        return;
    }

    const {
        rpcUrl,
        privateKey,
        chainId,
        gameLogicAddress,
        gameConfigAddress,
        backfillBlocks,
        mockReveal,
        shadowEnabled,
    } = env.settleKeeper;
    if (!rpcUrl || !privateKey || !chainId || !gameLogicAddress) {
        console.error(
            '[settle-keeper] KEEPER_ENABLED=true but KEEPER_RPC_URL / KEEPER_PRIVATE_KEY / ' +
                'KEEPER_CHAIN_ID / KEEPER_GAME_LOGIC_ADDRESS are not all set; keeper disabled',
        );
        return;
    }
    if (!gameConfigAddress) {
        console.log(
            '[settle-keeper] KEEPER_GAME_CONFIG_ADDRESS not set; live-battle-socket broadcast disabled ' +
                '(settling itself is unaffected)',
        );
    }

    if (shadowEnabled && !gameConfigAddress) {
        // Shadow mode reads the skill config from GameConfig, so without that address it
        // would silently observe nothing. Better to say so than to look enabled.
        console.warn(
            '[settle-keeper] KEEPER_SHADOW_ENABLED=true but KEEPER_GAME_CONFIG_ADDRESS is not set; ' +
                'shadow mode will not record any predictions',
        );
    }

    startKeeper({
        rpcUrl,
        privateKey,
        chainId,
        gameLogicAddress,
        gameConfigAddress,
        backfillBlocks,
        mockReveal,
        shadowEnabled,
    })
        .then((h) => { handle = h; })
        .catch((err) => console.error(`[settle-keeper] failed to start: ${(err as Error).message}`));
}

export function stopSettleKeeper(): void {
    handle?.stop();
    handle = null;
}
