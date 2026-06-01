import { env } from './config/env';
import app from './app';
import { startIndexers } from './indexer';

app.listen(env.port, () => {
    const { port } = env;
    console.log(`🚀 Backend server running on port ${port}`);
    console.log(`📊 Health check: http://localhost:${port}/api/health`);
    console.log(`🔐 Auth endpoints: http://localhost:${port}/api/auth`);
    console.log(`🛡️  Protected endpoints: http://localhost:${port}/api/protected`);
    console.log(`⚔️  Battle endpoints: http://localhost:${port}/api/battle`);

    // Background roster indexer (PvP matchmaking). No-op unless a chain is configured.
    startIndexers();
});
