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
const parsedPort = Number(process.env.PORT);

export const env = {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3001,

    /** JWT signing secret. Falls back to a dev-only value when unset. */
    jwtSecret: process.env.JWT_SECRET || 'fallback-secret-key',

    /** PostgreSQL connection string (required — Prisma cannot run without it). */
    databaseUrl: requireEnv('DATABASE_URL'),

    /** Comma-separated allowed CORS origins; unset = allow all (local dev). */
    corsOrigin: process.env.CORS_ORIGIN,

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
} as const;

// In production the webhook must not be left open: if Solana indexing is on, the
// shared secret is mandatory so POST /api/webhooks/helius can reject forged calls.
if (env.isProduction && env.solana.heliusRpcUrl && !env.solana.webhookSecret) {
    throw new Error(
        'HELIUS_WEBHOOK_SECRET is required in production when HELIUS_RPC_URL is set ' +
            '(secures POST /api/webhooks/helius).'
    );
}
