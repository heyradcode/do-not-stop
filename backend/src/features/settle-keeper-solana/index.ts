import { Keypair, PublicKey } from '@solana/web3.js';
import { env } from '@config/env';
import { startSolanaSettleKeeper, type SolanaSettleKeeperHandle } from './keeper';

/**
 * Solana counterpart to backend/src/features/settle-keeper/ (EVM). Settles
 * `commit_battle` requests once Switchboard On-Demand reveals their randomness, so the
 * player only signs the commit transaction. See docs/plan-realtime-battle-solana.md for
 * the design and why this covers battle only (breed/mint settle still require the
 * player's own signature).
 *
 * Off unless KEEPER_SOLANA_ENABLED=true, mirroring the EVM keeper: the feature simply
 * doesn't start rather than failing, so local dev / CI without a configured keeper wallet
 * is unaffected.
 */

let handle: SolanaSettleKeeperHandle | null = null;

export function startSolanaSettleKeeperFeature(): void {
    if (!env.solanaSettleKeeper.enabled) {
        console.log('[settle-keeper-solana] KEEPER_SOLANA_ENABLED not set; keeper disabled');
        return;
    }

    const { rpcUrl, keypairJson, programId: programIdStr, pollIntervalMs } = env.solanaSettleKeeper;
    if (!rpcUrl || !keypairJson || !programIdStr) {
        console.error(
            '[settle-keeper-solana] KEEPER_SOLANA_ENABLED=true but KEEPER_SOLANA_RPC_URL / ' +
                'KEEPER_SOLANA_KEYPAIR / KEEPER_SOLANA_PROGRAM_ID are not all set; keeper disabled',
        );
        return;
    }

    let keypair: Keypair;
    let programId: PublicKey;
    try {
        keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keypairJson) as number[]));
        programId = new PublicKey(programIdStr);
    } catch (err) {
        console.error(
            `[settle-keeper-solana] invalid KEEPER_SOLANA_KEYPAIR or KEEPER_SOLANA_PROGRAM_ID: ${(err as Error).message}`,
        );
        return;
    }

    startSolanaSettleKeeper({ rpcUrl, keypair, programId, pollIntervalMs })
        .then((h) => { handle = h; })
        .catch((err) => console.error(`[settle-keeper-solana] failed to start: ${(err as Error).message}`));
}

export function stopSolanaSettleKeeperFeature(): void {
    handle?.stop();
    handle = null;
}
