/**
 * Environment configuration. Read once at startup so a missing credential fails
 * loudly at boot rather than on the first image request.
 */

export interface WorkersAiConfig {
    accountId: string;
    apiToken: string;
    /** Workers AI model id, e.g. @cf/bytedance/stable-diffusion-xl-lightning. */
    model: string;
    /** Square output edge in pixels. */
    size: number;
    /** Diffusion steps. Lightning-class models are tuned for 4-8. */
    steps: number;
    timeoutMs: number;
}

const DEFAULTS = {
    // Lightning is the default over flux-1-schnell because it accepts an
    // explicit seed, which is what lets a pet's image be re-derived from its
    // DNA instead of only recovered from cache.
    model: '@cf/bytedance/stable-diffusion-xl-lightning',
    size: 1024,
    steps: 8,
    timeoutMs: 60_000,
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
    size: readNumber('CF_IMAGE_SIZE', DEFAULTS.size),
    steps: readNumber('CF_IMAGE_STEPS', DEFAULTS.steps),
    timeoutMs: readNumber('CF_TIMEOUT_MS', DEFAULTS.timeoutMs),
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
    return {
        kind: raw,
        root,
        r2: {
            accountId: process.env.R2_ACCOUNT_ID || readRequired('CF_ACCOUNT_ID'),
            accessKeyId: readRequired('R2_ACCESS_KEY_ID'),
            secretAccessKey: readRequired('R2_SECRET_ACCESS_KEY'),
            bucket: readRequired('R2_BUCKET'),
            ...(publicBaseUrl ? { publicBaseUrl } : {}),
        },
    };
};

export { ConfigError };
