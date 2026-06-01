import 'dotenv/config';
import app from './app';
import { startIndexers } from './indexer';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔐 Auth endpoints: http://localhost:${PORT}/api/auth`);
    console.log(`🛡️  Protected endpoints: http://localhost:${PORT}/api/protected`);
    console.log(`⚔️  Battle endpoints: http://localhost:${PORT}/api/battle`);

    // Background roster indexer (PvP matchmaking). No-op unless a chain is configured.
    startIndexers();
});
