import './register-path-aliases';
import { env } from '@config/env';
import { prisma } from '@config/prisma';
import app from './app';
import { startBattleStream, stopBattleStream } from '@grpc-client/battleStream';
import { configureSigner } from '@features/battle-signer';
import { startSettleKeeper, stopSettleKeeper } from '@features/settle-keeper';
import { startSolanaSettleKeeperFeature, stopSolanaSettleKeeperFeature } from '@features/settle-keeper-solana';
import { type BattleWorkerHandle, startBattleWorker } from '@features/battle-worker';
import { startLiveBattleSocket, stopLiveBattleSocket } from '@ws/liveBattleSocket';

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
    // indexer-go battle push (chain-truth settles). No-op unless INDEXER_GRPC_ADDR is set.
    startBattleStream();
    // Settles GameLogic battle/breed/mint requests once entropy reveals. No-op unless
    // KEEPER_ENABLED is set.
    startSettleKeeper();
    // Settles Solana commit_battle requests once Switchboard reveals. No-op unless
    // KEEPER_SOLANA_ENABLED is set.
    startSolanaSettleKeeperFeature();

    // Backend-authoritative battles (docs/plan-backend-battle-architecture.md). Selects the
    // signing backend (refuses an in-process key in production; see @features/battle-signer)
    // and starts the outbox worker that carries accepted battles from `committed` through
    // `computed`. Both are always on: unlike the settle keepers there is no separate enable
    // flag yet, since accepting a battle already requires a configured signer to succeed.
    configureSigner(Math.floor(Date.now() / 1000));
    battleWorker = startBattleWorker(`backend-${process.pid}`);
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
    stopSolanaSettleKeeperFeature();
    battleWorker?.stop();
    stopLiveBattleSocket();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();

    console.log('[server] shutdown complete');
    process.exit(0);
}

process.on('SIGTERM', (signal) => void shutdown(signal));
process.on('SIGINT', (signal) => void shutdown(signal));
