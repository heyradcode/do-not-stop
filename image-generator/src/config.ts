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

export { ConfigError };
