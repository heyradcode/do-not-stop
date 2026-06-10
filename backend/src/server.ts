import './register-path-aliases';
import { env } from '@config/env';
import { prisma } from '@config/prisma';
import app from './app';
import { startIndexers, stopIndexers } from '@indexer';

const server = app.listen(env.port, () => {
    const { port } = env;
    console.log(`🚀 Backend server running on port ${port}`);
    console.log(`📊 Health check: http://localhost:${port}/api/health`);
    console.log(`🔐 Auth endpoints: http://localhost:${port}/api/auth`);
    console.log(`🛡️  Protected endpoints: http://localhost:${port}/api/protected`);
    console.log(`⚔️  GraphQL endpoint: http://localhost:${port}/graphql`);

    // Background roster indexer (PvP matchmaking). No-op unless a chain is configured.
    startIndexers();
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

    stopIndexers();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();

    console.log('[server] shutdown complete');
    process.exit(0);
}

process.on('SIGTERM', (signal) => void shutdown(signal));
process.on('SIGINT', (signal) => void shutdown(signal));
