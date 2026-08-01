/**
 * Environment configuration. Read once at startup so a missing credential fails
 * loudly at boot rather than on the first image request.
 */

export interface WorkersAiConfig {
    accountId: string;
    apiToken: string;
    /** Workers AI model id, e.g. @cf/bytedance/stable-diffusion-xl-lightning. */
    model: string;
    /** Account-run endpoint base. Overridable so the built server can be driven
     *  against a fake endpoint without credentials, and so a Cloudflare-compatible
     *  gateway can be put in front. */
    apiBase: string;
    /** Square output edge in pixels. */
    size: number;
    /** Diffusion steps. Lightning-class models are tuned for 4-8. */
    steps: number;
    timeoutMs: number;
    /** Total attempts per image, including the first. 1 disables retrying. */
    attempts: number;
    /** Simultaneous generations allowed. Bursty crawls are the normal case. */
    maxConcurrent: number;
}

const DEFAULTS = {
    // Lightning is the default over flux-1-schnell because it accepts an
    // explicit seed, which is what lets a pet's image be re-derived from its
    // DNA instead of only recovered from cache.
    model: '@cf/bytedance/stable-diffusion-xl-lightning',
    apiBase: 'https://api.cloudflare.com/client/v4/accounts',
    size: 1024,
    steps: 8,
    timeoutMs: 60_000,
    attempts: 3,
    // Low on purpose: the free allocation is small, and a queue behind two
    // in-flight generations drains fast enough that no caller notices.
    maxConcurrent: 2,
} as const;

class ConfigError extends Error {}

const readNumber = (name: string, fallback: number): number => {
    const raw = process.env[name];
    if (raw == null || raw === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new ConfigError(`${name} must be a positive number, got "${raw}"`);
    }
    return parsed;
};

const readRequired = (name: string): string => {
    const raw = process.env[name];
    if (raw == null || raw === '') {
        throw new ConfigError(`${name} is required. See image-generator/env.example.`);
    }
    return raw;
};

export const loadWorkersAiConfig = (): WorkersAiConfig => ({
    accountId: readRequired('CF_ACCOUNT_ID'),
    apiToken: readRequired('CF_API_TOKEN'),
    model: process.env.CF_IMAGE_MODEL || DEFAULTS.model,
    apiBase: process.env.CF_API_BASE || DEFAULTS.apiBase,
    size: readNumber('CF_IMAGE_SIZE', DEFAULTS.size),
    steps: readNumber('CF_IMAGE_STEPS', DEFAULTS.steps),
    timeoutMs: readNumber('CF_TIMEOUT_MS', DEFAULTS.timeoutMs),
    attempts: readNumber('CF_MAX_ATTEMPTS', DEFAULTS.attempts),
    maxConcurrent: readNumber('CF_MAX_CONCURRENT', DEFAULTS.maxConcurrent),
});

/** Which ImageStore backs the service. `memory` never persists, so it is only
 *  correct for one-shot CLI runs and tests: a server on `memory` regenerates
 *  after every restart, which costs money and changes existing pets' art. */
export type StoreKind = 'r2' | 'filesystem' | 'memory';

export interface StoreSelection {
    kind: StoreKind;
    /** filesystem only. */
    root: string;
    /** r2 only. */
    r2?: {
        accountId: string;
        accessKeyId: string;
        secretAccessKey: string;
        bucket: string;
        publicBaseUrl?: string;
        endpoint?: string;
    };
}

const STORE_KINDS: readonly StoreKind[] = ['r2', 'filesystem', 'memory'];

const isStoreKind = (value: string): value is StoreKind => (STORE_KINDS as readonly string[]).includes(value);

export const loadStoreSelection = (fallback: StoreKind = 'r2'): StoreSelection => {
    const raw = process.env.IMAGE_STORE || fallback;
    if (!isStoreKind(raw)) {
        throw new ConfigError(`IMAGE_STORE must be one of ${STORE_KINDS.join(', ')}, got "${raw}"`);
    }

    const root = process.env.IMAGE_STORE_ROOT || './.art';
    if (raw !== 'r2') return { kind: raw, root };

    const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
    const endpoint = process.env.R2_ENDPOINT;
    return {
        kind: raw,
        root,
        r2: {
            accountId: process.env.R2_ACCOUNT_ID || readRequired('CF_ACCOUNT_ID'),
            accessKeyId: readRequired('R2_ACCESS_KEY_ID'),
            secretAccessKey: readRequired('R2_SECRET_ACCESS_KEY'),
            bucket: readRequired('R2_BUCKET'),
            ...(publicBaseUrl ? { publicBaseUrl } : {}),
            ...(endpoint ? { endpoint } : {}),
        },
    };
};

export interface ServerConfig {
    port: number;
    /** Absolute URL this service is reachable at, used in metadata image links. */
    publicBaseUrl: string;
    /** Per-pet game URL template; `{chain}` and `{tokenId}` are substituted. */
    externalUrlTemplate?: string;
    /** How long an image request waits before answering 503 and letting the
     *  generation finish in the background. */
    responseTimeoutMs: number;
    evm: {
        rpcUrl: string;
        petCoreAddress: string;
    };
    /** Absent when this deployment serves EVM only, which is supported. */
    solana?: {
        rpcUrl: string;
        programId: string;
    };
}

export const loadServerConfig = (): ServerConfig => {
    const port = readNumber('PORT', 8787);
    const externalUrlTemplate = process.env.EXTERNAL_URL_TEMPLATE;

    // Solana is opt-in: both vars or neither. Half-configured is a typo rather
    // than an intention, so it fails at boot instead of 501-ing per request.
    const solanaRpcUrl = process.env.SOLANA_RPC_URL;
    const solanaProgramId = process.env.SOLANA_PROGRAM_ID;
    if (Boolean(solanaRpcUrl) !== Boolean(solanaProgramId)) {
        throw new ConfigError(
            'SOLANA_RPC_URL and SOLANA_PROGRAM_ID must be set together, or both left unset',
        );
    }

    return {
        port,
        // Defaults to localhost so `pnpm dev` works with no config; production
        // must set this or metadata will hand marketplaces unreachable image URLs.
        publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${port}`,
        responseTimeoutMs: readNumber('IMAGE_RESPONSE_TIMEOUT_MS', 25_000),
        ...(externalUrlTemplate ? { externalUrlTemplate } : {}),
        evm: {
            rpcUrl: readRequired('EVM_RPC_URL'),
            petCoreAddress: readRequired('PETCORE_ADDRESS'),
        },
        ...(solanaRpcUrl && solanaProgramId
            ? { solana: { rpcUrl: solanaRpcUrl, programId: solanaProgramId } }
            : {}),
    };
};

export { ConfigError };
