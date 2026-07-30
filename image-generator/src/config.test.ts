import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ConfigError,
    loadServerConfig,
    loadStoreSelection,
    loadWorkersAiConfig,
} from './config.js';

afterEach(() => {
    vi.unstubAllEnvs();
});

/** Every var this module reads. Listed so each call can blank the ones it is not
 *  setting: otherwise stubs accumulate within a test, and a developer's real .env
 *  would leak into the suite. Every consumer treats "" as unset. */
const ALL_VARS = [
    'CF_ACCOUNT_ID', 'CF_API_TOKEN', 'CF_IMAGE_MODEL', 'CF_IMAGE_SIZE', 'CF_IMAGE_STEPS',
    'CF_TIMEOUT_MS', 'CF_MAX_ATTEMPTS', 'CF_MAX_CONCURRENT',
    'IMAGE_STORE', 'IMAGE_STORE_ROOT',
    'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ACCOUNT_ID', 'R2_PUBLIC_BASE_URL',
    'PORT', 'PUBLIC_BASE_URL', 'EXTERNAL_URL_TEMPLATE',
    'EVM_RPC_URL', 'PETCORE_ADDRESS', 'SOLANA_RPC_URL', 'SOLANA_PROGRAM_ID',
] as const;

/** Every required var set, so each test can knock out exactly one thing. */
const withValidEnv = (overrides: Record<string, string> = {}) => {
    const env: Record<string, string> = {
        CF_ACCOUNT_ID: 'acct',
        CF_API_TOKEN: 'token',
        EVM_RPC_URL: 'https://rpc.example',
        PETCORE_ADDRESS: '0x0BB0e03259Cf9DA7B0A3e258e2D17d68D7be9d33',
        ...overrides,
    };
    for (const name of ALL_VARS) vi.stubEnv(name, env[name] ?? '');
};

describe('loadWorkersAiConfig', () => {
    it('applies defaults when only credentials are set', () => {
        withValidEnv();
        const config = loadWorkersAiConfig();

        expect(config).toMatchObject({
            accountId: 'acct',
            apiToken: 'token',
            model: '@cf/bytedance/stable-diffusion-xl-lightning',
    apiBase: 'https://api.cloudflare.com/client/v4/accounts',
            size: 1024,
            steps: 8,
            timeoutMs: 60_000,
            attempts: 3,
            maxConcurrent: 2,
        });
    });

    it('fails at boot on a missing credential, naming it', () => {
        withValidEnv({ CF_API_TOKEN: '' });
        expect(() => loadWorkersAiConfig()).toThrow(ConfigError);
        expect(() => loadWorkersAiConfig()).toThrow(/CF_API_TOKEN is required/);
    });

    it('treats an empty string as unset, not as a valid value', () => {
        withValidEnv({ CF_IMAGE_MODEL: '' });
        expect(loadWorkersAiConfig().model).toBe('@cf/bytedance/stable-diffusion-xl-lightning');
    });

    it('overrides every tunable from the environment', () => {
        withValidEnv({
            CF_IMAGE_MODEL: '@cf/black-forest-labs/flux-1-schnell',
            CF_IMAGE_SIZE: '512',
            CF_IMAGE_STEPS: '4',
            CF_TIMEOUT_MS: '15000',
            CF_MAX_ATTEMPTS: '5',
            CF_MAX_CONCURRENT: '1',
        });

        expect(loadWorkersAiConfig()).toMatchObject({
            model: '@cf/black-forest-labs/flux-1-schnell',
            size: 512,
            steps: 4,
            timeoutMs: 15_000,
            attempts: 5,
            maxConcurrent: 1,
        });
    });

    it('rejects a non-numeric or non-positive tunable rather than coercing it', () => {
        for (const bad of ['abc', '0', '-1', 'NaN']) {
            withValidEnv({ CF_IMAGE_STEPS: bad });
            expect(() => loadWorkersAiConfig()).toThrow(/CF_IMAGE_STEPS must be a positive number/);
        }
    });
});

describe('loadStoreSelection', () => {
    it('defaults to r2, the only backend that persists across instances', () => {
        withValidEnv({
            R2_BUCKET: 'art',
            R2_ACCESS_KEY_ID: 'key',
            R2_SECRET_ACCESS_KEY: 'secret',
        });

        const selection = loadStoreSelection();
        expect(selection.kind).toBe('r2');
        expect(selection.r2).toMatchObject({ bucket: 'art', accountId: 'acct' });
    });

    it('falls back to CF_ACCOUNT_ID when R2_ACCOUNT_ID is not set separately', () => {
        withValidEnv({
            R2_BUCKET: 'art',
            R2_ACCESS_KEY_ID: 'key',
            R2_SECRET_ACCESS_KEY: 'secret',
            R2_ACCOUNT_ID: 'other-account',
        });
        expect(loadStoreSelection().r2?.accountId).toBe('other-account');
    });

    it('demands R2 credentials only when R2 is the selected store', () => {
        withValidEnv({ IMAGE_STORE: 'filesystem' });
        expect(() => loadStoreSelection()).not.toThrow();

        withValidEnv({ IMAGE_STORE: 'r2' });
        expect(() => loadStoreSelection()).toThrow(/R2_ACCESS_KEY_ID is required/);
    });

    it('rejects an unknown store rather than silently falling back', () => {
        withValidEnv({ IMAGE_STORE: 's3' });
        expect(() => loadStoreSelection()).toThrow(/IMAGE_STORE must be one of/);
    });

    it('honours the caller fallback, which is how the CLI defaults to disk', () => {
        withValidEnv();
        expect(loadStoreSelection('filesystem').kind).toBe('filesystem');
        expect(loadStoreSelection('memory').kind).toBe('memory');
    });

    it('lets IMAGE_STORE win over the caller fallback', () => {
        withValidEnv({ IMAGE_STORE: 'memory' });
        expect(loadStoreSelection('filesystem').kind).toBe('memory');
    });

    it('omits publicBaseUrl when the bucket is not public', () => {
        withValidEnv({
            R2_BUCKET: 'art',
            R2_ACCESS_KEY_ID: 'key',
            R2_SECRET_ACCESS_KEY: 'secret',
        });
        expect(loadStoreSelection().r2?.publicBaseUrl).toBeUndefined();
    });
});

describe('loadServerConfig', () => {
    it('defaults the base URL to localhost on the configured port', () => {
        withValidEnv({ PORT: '9000' });
        const config = loadServerConfig();

        expect(config.port).toBe(9000);
        expect(config.publicBaseUrl).toBe('http://localhost:9000');
        expect(config.solana).toBeUndefined();
    });

    it('requires the EVM chain settings, which every deployment needs', () => {
        withValidEnv({ PETCORE_ADDRESS: '' });
        expect(() => loadServerConfig()).toThrow(/PETCORE_ADDRESS is required/);
    });

    // Half-configured Solana is a typo, not an intention: failing at boot beats
    // 501-ing per request once someone believes the chain is wired up.
    it('refuses a half-configured Solana rather than silently disabling it', () => {
        withValidEnv({ SOLANA_RPC_URL: 'https://api.devnet.solana.com' });
        expect(() => loadServerConfig()).toThrow(/must be set together/);

        withValidEnv({ SOLANA_PROGRAM_ID: 'CrYPtoPeTs1111111111111111111111111111111111' });
        expect(() => loadServerConfig()).toThrow(/must be set together/);
    });

    it('enables Solana when both vars are present', () => {
        withValidEnv({
            SOLANA_RPC_URL: 'https://api.devnet.solana.com',
            SOLANA_PROGRAM_ID: 'CrYPtoPeTs1111111111111111111111111111111111',
        });

        expect(loadServerConfig().solana).toEqual({
            rpcUrl: 'https://api.devnet.solana.com',
            programId: 'CrYPtoPeTs1111111111111111111111111111111111',
        });
    });

    it('omits the external URL template when unset, rather than emitting an empty link', () => {
        withValidEnv();
        expect(loadServerConfig().externalUrlTemplate).toBeUndefined();

        withValidEnv({ EXTERNAL_URL_TEMPLATE: 'https://game.example/{chain}/{tokenId}' });
        expect(loadServerConfig().externalUrlTemplate).toBe('https://game.example/{chain}/{tokenId}');
    });
});
