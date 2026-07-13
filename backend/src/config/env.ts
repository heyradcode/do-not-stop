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

    /**
     * Settle keeper (plan-realtime-battle-ux.md / plan-realtime-battle-impl.md Phase 2):
     * settles GameLogic battle/breed/mint requests from this wallet once Pyth Entropy
     * reveals, so the player doesn't send the settle transaction themselves. Off unless
     * KEEPER_ENABLED=true; the four fields below are required once it is (checked at
     * startSettleKeeper() time so a misconfigured keeper logs and no-ops rather than
     * crashing the whole server on boot).
     */
    settleKeeper: {
        enabled: process.env.KEEPER_ENABLED?.trim().toLowerCase() === 'true',
        rpcUrl: process.env.KEEPER_RPC_URL?.trim() || undefined,
        privateKey: (process.env.KEEPER_PRIVATE_KEY?.trim()
            ? (process.env.KEEPER_PRIVATE_KEY.trim().startsWith('0x')
                ? process.env.KEEPER_PRIVATE_KEY.trim()
                : `0x${process.env.KEEPER_PRIVATE_KEY.trim()}`)
            : undefined) as `0x${string}` | undefined,
        chainId: process.env.KEEPER_CHAIN_ID ? Number(process.env.KEEPER_CHAIN_ID) : undefined,
        gameLogicAddress: process.env.KEEPER_GAME_LOGIC_ADDRESS?.trim() as `0x${string}` | undefined,
        backfillBlocks: BigInt(process.env.KEEPER_BACKFILL_BLOCKS?.trim() || '5000'),
        /** Local dev only: also acts as the Entropy provider (MockEntropy.mockReveal),
         *  replacing the old removed vrf-fulfill-watcher.ts for the entropy flow. Refuse
         *  to enable unless the keeper is also targeting a low chain id typical of a
         *  local Hardhat node, so this can't accidentally get flipped on against a real
         *  network. */
        mockReveal:
            process.env.KEEPER_MOCK_REVEAL?.trim().toLowerCase() === 'true' &&
            Number(process.env.KEEPER_CHAIN_ID) === 31337,
    },
} as const;
