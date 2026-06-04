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
     * AI battle dialogue (see AI_BATTLE_DIALOGUE.md). Optional — when `apiKey` is
     * unset the feature degrades gracefully to templated fallback lines, so the
     * app runs fine without a key in local dev.
     */
    anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY?.trim() || undefined,
        /** Default model for battle banter — fast + cheap. */
        model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-4-5-20251001',
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
