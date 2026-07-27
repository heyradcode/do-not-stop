import { env } from '@config/env';
import { startKeeper, type SettleKeeperHandle } from './keeper';

/**
 * Settles GameLogic breed/mint requests from a backend-held wallet the moment
 * Pyth Entropy reveals, so the player never has to send the second (settle)
 * transaction themselves. See docs/plan-realtime-battle-ux.md and
 * docs/plan-realtime-battle-impl.md Phase 2 for the original design; battles no
 * longer take this path at all (§L Phase 6), breed and mint still do.
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

    const { rpcUrl, privateKey, chainId, gameLogicAddress, backfillBlocks, mockReveal } = env.settleKeeper;
    if (!rpcUrl || !privateKey || !chainId || !gameLogicAddress) {
        console.error(
            '[settle-keeper] KEEPER_ENABLED=true but KEEPER_RPC_URL / KEEPER_PRIVATE_KEY / ' +
                'KEEPER_CHAIN_ID / KEEPER_GAME_LOGIC_ADDRESS are not all set; keeper disabled',
        );
        return;
    }
    startKeeper({ rpcUrl, privateKey, chainId, gameLogicAddress, backfillBlocks, mockReveal })
        .then((h) => { handle = h; })
        .catch((err) => console.error(`[settle-keeper] failed to start: ${(err as Error).message}`));
}

export function stopSettleKeeper(): void {
    handle?.stop();
    handle = null;
}
