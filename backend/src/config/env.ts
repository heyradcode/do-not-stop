import 'dotenv/config';

/**
 * Centralized, validated environment access. Importing this module loads `.env`
 * (via `dotenv/config`) as a side effect, so it must be the first thing any
 * entrypoint pulls in. Every other module reads config from `env` rather than
 * touching `process.env` directly — one source of truth.
 */

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not set. Copy env.example to .env and configure it.`);
    }
    return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';
const parsedPort = Number(process.env.PORT);
const parsedIndexerInterval = Number(process.env.INDEXER_INTERVAL_MS);

export const env = {
    nodeEnv,
    isProduction,
    port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3001,

    /**
     * JWT signing secret. Required in production (anyone knowing the secret can
     * mint valid tokens); falls back to a dev-only value otherwise.
     */
    jwtSecret: isProduction ? requireEnv('JWT_SECRET') : process.env.JWT_SECRET || 'dev-only-secret',

    /** PostgreSQL connection string (required — Prisma cannot run without it). */
    databaseUrl: requireEnv('DATABASE_URL'),

    /** Comma-separated allowed CORS origins; unset = allow all (local dev). */
    corsOrigin: process.env.CORS_ORIGIN,

    /** Background roster indexer (PvP matchmaking) — see src/indexer. */
    indexer: {
        /** Set INDEXER_ENABLED=false to turn the background indexer off. */
        enabled: (process.env.INDEXER_ENABLED ?? 'true').toLowerCase() !== 'false',
        /** Poll interval for EVM incremental sync and Solana backfill (ms). */
        intervalMs:
            Number.isFinite(parsedIndexerInterval) && parsedIndexerInterval > 0
                ? parsedIndexerInterval
                : 60_000,
        /** EVM subgraph query endpoint (`SUBGRAPH_URL` is a legacy alias). */
        evmSubgraphUrl:
            process.env.SUBGRAPH_URL_EVM?.trim() || process.env.SUBGRAPH_URL?.trim() || undefined,
    },

    /**
     * Solana indexing via Helius (RPC reconciliation scan + push webhook). All
     * optional — Solana indexing is a no-op unless `heliusRpcUrl` and
     * `programId` are both set.
     */
    solana: {
        /** Full Helius RPC URL incl. `?api-key=`, e.g. https://devnet.helius-rpc.com/?api-key=<key>. */
        heliusRpcUrl: process.env.HELIUS_RPC_URL?.trim() || undefined,
        /** CryptoPets program id (base58). */
        programId: process.env.SOLANA_PROGRAM_ID?.trim() || undefined,
        /** Shared secret Helius sends in the webhook `Authorization` header. */
        webhookSecret: process.env.HELIUS_WEBHOOK_SECRET?.trim() || undefined,
    },

    /**
     * AI battle dialogue (see AI_BATTLE_DIALOGUE.md), via the Hugging Face
     * OpenAI-compatible chat router (Vercel AI SDK). Optional: when `apiToken`
     * is unset the feature degrades to templated fallback lines, so the app runs
     * fine without a token in local dev.
     */
    hf: {
        apiToken: process.env.HF_API_TOKEN?.trim() || undefined,
        /** Any chat-completion model on HF inference. Verify availability/tier. */
        model: process.env.HF_MODEL?.trim() || 'meta-llama/Llama-3.1-8B-Instruct',
        /** Base URL for the OpenAI-compatible inference endpoint (no /chat/completions suffix). */
        baseUrl: process.env.HF_API_URL?.trim().replace(/\/chat\/completions$/, '') || 'https://router.huggingface.co/v1',
    },

    /**
     * Optional Redis for the battle-dialogue pregen store. Unset = in-process Map
     * (fine single-instance). Set it to survive restarts / scale to multiple
     * instances — also run `pnpm add ioredis`, which is imported only when set.
     */
    redis: {
        url: process.env.REDIS_URL?.trim() || undefined,
    },

    /**
     * indexer-go gRPC link (StreamLiveBattles — chain-truth battle pushes).
     * Optional: unset = feature off, the webhook/poll paths still work.
     */
    indexerGrpc: {
        /** e.g. localhost:50051. */
        addr: process.env.INDEXER_GRPC_ADDR?.trim() || undefined,
        /** Path to the shared proto contract (defaults to ../proto from the backend dir). */
        protoPath: process.env.INDEXER_PROTO_PATH?.trim() || undefined,
    },

    /**
     * Where roster reads (matchmaking) are answered: 'grpc' = indexer-go's
     * RAM cache with automatic Prisma fallback; 'postgres' (default) = Prisma
     * only. The instant kill switch for the milestone 8 read path — flip back
     * without redeploying indexer-go.
     */
    rosterReadSource:
        process.env.ROSTER_READ_SOURCE?.trim().toLowerCase() === 'grpc' ? 'grpc' : 'postgres',
} as const;

// In production the webhook must not be left open: if Solana indexing is on, the
// shared secret is mandatory so POST /api/webhooks/helius can reject forged calls.
if (env.isProduction && env.solana.heliusRpcUrl && !env.solana.webhookSecret) {
    throw new Error(
        'HELIUS_WEBHOOK_SECRET is required in production when HELIUS_RPC_URL is set ' +
            '(secures POST /api/webhooks/helius).'
    );
}
