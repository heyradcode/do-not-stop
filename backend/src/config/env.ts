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
} as const;
