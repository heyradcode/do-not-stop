import './register-path-aliases';
import { env } from '@config/env';
import { prisma } from '@config/prisma';
import app from './app';
import { startBattleStream, stopBattleStream } from '@grpc-client/battleStream';
import { configureSigner, loadPersistedSigningKeys } from '@features/battle-signer';
import { startSettleKeeper, stopSettleKeeper } from '@features/settle-keeper';
import { type BattleWorkerHandle, startBattleWorker } from '@features/battle-worker';
import { startBatchAnchor, stopBatchAnchor } from '@features/battle-anchor';
import { startLiveBattleSocket, stopLiveBattleSocket } from '@ws/liveBattleSocket';
import { startBattleRoomSocket, stopBattleRoomSocket } from '@ws/battleRoomSocket';

let battleWorker: BattleWorkerHandle | undefined;

// Bind 0.0.0.0 so Render's internal health check can reach the process
// (listen(port) alone is not always reachable on their network scan).
const server = app.listen(env.port, '0.0.0.0', () => {
    const { port } = env;
    console.log(`🚀 Backend server running on 0.0.0.0:${port}`);
    console.log(`📊 Health check: http://localhost:${port}/api/health`);
    console.log(`🔐 Auth endpoints: http://localhost:${port}/api/auth`);
    console.log(`🛡️  Protected endpoints: http://localhost:${port}/api/protected`);
    console.log(`⚔️  GraphQL endpoint: http://localhost:${port}/graphql`);

    // Pushes a computed battle sim to the frontend the moment entropy reveals (settle
    // keeper's job). Always listening; only actually broadcasts once the keeper is enabled
    // with KEEPER_GAME_CONFIG_ADDRESS set.
    startLiveBattleSocket(server);
    // Notification-only per-room channel for backend-authoritative battles (§J). Always on;
    // a client only gets pushed to if it connected with a roomId it already knows about.
    startBattleRoomSocket(server);
    // indexer-go battle push (chain-truth settles). No-op unless INDEXER_GRPC_ADDR is set.
    startBattleStream();
    // Settles GameLogic battle/breed/mint requests once entropy reveals. No-op unless
    // KEEPER_ENABLED is set.
    startSettleKeeper();

    // Backend-authoritative battles (docs/plan-backend-battle-architecture.md §L Phase 3).
    // Selects the signing backend (refuses an in-process key in production; see
    // @features/battle-signer) and starts the outbox worker that carries accepted battles
    // through to a signed receipt.
    //
    // Both are gated on the mode, so a deployment running only the on-chain path needs no
    // signing key at all. The read routes and the public corpus stay served either way —
    // receipts already issued must remain checkable after the mode is switched off.
    if (env.battle.enabled) {
        configureSigner(Math.floor(Date.now() / 1000));
        // Republishes every key this deployment has ever signed under. Without it the
        // registry is only as old as the process, and a rotated key vanishes on the next
        // deploy — making its receipts unverifiable rather than invalid (§H item 4).
        void loadPersistedSigningKeys().catch((error: unknown) =>
            console.error(`[battle-signer] could not load persisted signing keys: ${(error as Error).message}`),
        );
        battleWorker = startBattleWorker(`backend-${process.pid}`);
        // Aggregates published receipts into Merkle batches and anchors the roots (§I).
        // No-ops unless BATTLE_ANCHOR_* is configured; batches are still built either way.
        startBatchAnchor();
    } else {
        console.log('[battle] BATTLE_BACKEND_MODE_ENABLED not set; backend battle writes disabled (reads stay served)');
    }
});

/** Force-exit deadline: don't let a stuck connection block the orchestrator forever. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

let shuttingDown = false;

/**
 * Graceful shutdown: stop the indexer timers, stop accepting connections and
 * drain in-flight requests, then release the DB pool. The orchestrator's
 * SIGTERM (deploy, scale-down) exits cleanly instead of killing mid-upsert.
 */
async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received, shutting down...`);

    const forceExit = setTimeout(() => {
        console.error('[server] shutdown timed out, exiting forcefully');
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref(); // don't let the failsafe itself keep the process alive

    stopBattleStream();
    stopSettleKeeper();
    battleWorker?.stop();
    stopBatchAnchor();
    stopLiveBattleSocket();
    stopBattleRoomSocket();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();

    console.log('[server] shutdown complete');
    process.exit(0);
}

process.on('SIGTERM', (signal) => void shutdown(signal));
process.on('SIGINT', (signal) => void shutdown(signal));
