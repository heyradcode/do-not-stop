import { describe, it, expect, vi } from 'vitest';
import type { WorkersAiConfig } from './config.js';
import { buildPetPrompt } from './prompt.js';
import { derivePetVisualTraits } from './traits.js';
import type { RetryOptions } from './retry.js';
import { WorkersAiError, buildRequestBody, generateImage } from './workersAi.js';

const DNA = 79_34_05_61_88_13_42_07n;
const SPEC = buildPetPrompt(derivePetVisualTraits({ dna: DNA, rarity: 3 }), DNA);

const config = (overrides: Partial<WorkersAiConfig> = {}): WorkersAiConfig => ({
    accountId: 'acct123',
    apiToken: 'token123',
    model: '@cf/bytedance/stable-diffusion-xl-lightning',
    size: 1024,
    steps: 8,
    timeoutMs: 5_000,
    attempts: 3,
    maxConcurrent: 2,
    ...overrides,
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** Most cases assert one attempt's behaviour; retrying is exercised separately
 *  below (and in retry.test.ts) with a fake clock, so no test really sleeps. */
const NO_RETRY: RetryOptions = { attempts: 1, baseDelayMs: 0, maxDelayMs: 0 };

const instantRetry = (attempts: number): RetryOptions => ({
    attempts,
    baseDelayMs: 10,
    maxDelayMs: 10,
    sleep: async () => {},
    onRetry: () => {},
});

const respond = (body: string | Buffer, init: ResponseInit): typeof fetch =>
    vi.fn(async () => new Response(body, init)) as unknown as typeof fetch;

describe('buildRequestBody', () => {
    it('sends SDXL knobs for the stable-diffusion family', () => {
        expect(buildRequestBody(config(), SPEC)).toEqual({
            prompt: SPEC.prompt,
            negative_prompt: SPEC.negativePrompt,
            height: 1024,
            width: 1024,
            num_steps: 8,
            seed: SPEC.seed,
        });
    });

    it('sends flux only its documented input, and caps steps', () => {
        const body = buildRequestBody(
            config({ model: '@cf/black-forest-labs/flux-1-schnell', steps: 20 }),
            SPEC,
        );

        // Anything outside flux's schema risks a 400, which is non-retryable and
        // would fail every request. Seed is excluded for that reason, so flux
        // output is not re-derivable from DNA.
        expect(body).toEqual({ prompt: SPEC.prompt, steps: 8 });
        expect(body).not.toHaveProperty('seed');
        expect(body).not.toHaveProperty('negative_prompt');
        expect(body).not.toHaveProperty('width');
    });
});

describe('generateImage', () => {
    it('posts to the account/model run endpoint with the bearer token', async () => {
        const fetchImpl = respond(PNG, { headers: { 'content-type': 'image/png' } });
        await generateImage(config(), SPEC, fetchImpl, NO_RETRY);

        const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!;
        expect(url).toBe(
            'https://api.cloudflare.com/client/v4/accounts/acct123/ai/run/@cf/bytedance/stable-diffusion-xl-lightning',
        );
        expect(init?.method).toBe('POST');
        expect((init?.headers as Record<string, string>).authorization).toBe('Bearer token123');
        expect(JSON.parse(init?.body as string).seed).toBe(SPEC.seed);
    });

    it('returns raw bytes when the model streams an image', async () => {
        const bytes = await generateImage(
            config(),
            SPEC,
            respond(PNG, { headers: { 'content-type': 'image/png' } }),
        );
        expect(bytes.equals(PNG)).toBe(true);
    });

    it('decodes base64 from the Cloudflare JSON envelope', async () => {
        const bytes = await generateImage(
            config({ model: '@cf/black-forest-labs/flux-1-schnell' }),
            SPEC,
            respond(JSON.stringify({ success: true, result: { image: PNG.toString('base64') } }), {
                headers: { 'content-type': 'application/json' },
            }),
        );
        expect(bytes.equals(PNG)).toBe(true);
    });

    it('reports the status and body on an HTTP error', async () => {
        const fetchImpl = respond('bad request', { status: 400, headers: { 'content-type': 'text/plain' } });

        await expect(generateImage(config(), SPEC, fetchImpl, NO_RETRY)).rejects.toThrow(WorkersAiError);
        await expect(generateImage(config(), SPEC, fetchImpl, NO_RETRY)).rejects.toThrow(/400.*bad request/s);
    });

    it('reports Cloudflare-level failures that arrive with HTTP 200', async () => {
        const fetchImpl = respond(
            JSON.stringify({ success: false, errors: [{ code: 3036, message: 'Account limited' }] }),
            { headers: { 'content-type': 'application/json' } },
        );

        await expect(generateImage(config(), SPEC, fetchImpl, NO_RETRY)).rejects.toThrow(/Account limited/);
    });

    it('rejects a success envelope with no image', async () => {
        const fetchImpl = respond(JSON.stringify({ success: true, result: {} }), {
            headers: { 'content-type': 'application/json' },
        });

        await expect(generateImage(config(), SPEC, fetchImpl, NO_RETRY)).rejects.toThrow(/no image payload/);
    });
});

describe('generateImage retrying', () => {
    /** Fails the first `failures` calls with `init`, then serves a PNG. */
    const flaky = (failures: number, init: ResponseInit): typeof fetch => {
        let calls = 0;
        return vi.fn(async () =>
            ++calls <= failures
                ? new Response('rate limited', init)
                : new Response(PNG, { headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch;
    };

    it('retries a 429 and returns the eventual image', async () => {
        const fetchImpl = flaky(2, { status: 429 });
        const bytes = await generateImage(config(), SPEC, fetchImpl, instantRetry(3));

        expect(bytes.equals(PNG)).toBe(true);
        expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(3);
    });

    it('retries a 5xx', async () => {
        const fetchImpl = flaky(1, { status: 503 });
        await generateImage(config(), SPEC, fetchImpl, instantRetry(2));
        expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(2);
    });

    it('does not retry a 4xx other than 429, since the request itself is wrong', async () => {
        const fetchImpl = flaky(1, { status: 422 });
        await expect(generateImage(config(), SPEC, fetchImpl, instantRetry(3))).rejects.toThrow(/422/);
        expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(1);
    });

    it('retries a transport failure, which never produced an image', async () => {
        let calls = 0;
        const fetchImpl = vi.fn(async () => {
            if (++calls === 1) throw new TypeError('fetch failed');
            return new Response(PNG, { headers: { 'content-type': 'image/png' } });
        }) as unknown as typeof fetch;

        const bytes = await generateImage(config(), SPEC, fetchImpl, instantRetry(2));
        expect(bytes.equals(PNG)).toBe(true);
        expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(2);
    });

    it('gives up after the configured attempts and surfaces the last error', async () => {
        const fetchImpl = flaky(99, { status: 429 });
        await expect(generateImage(config(), SPEC, fetchImpl, instantRetry(3))).rejects.toThrow(/429/);
        expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(3);
    });

    // Regression: attempts used to be read into config and never passed on, so
    // CF_MAX_ATTEMPTS was a documented env var that did nothing.
    it('honours config.attempts when the caller passes no retry options', async () => {
        const fetchImpl = flaky(99, { status: 429 });
        const started = Date.now();

        await expect(generateImage(config({ attempts: 1 }), SPEC, fetchImpl)).rejects.toThrow(/429/);

        expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(1);
        // attempts: 1 also means no backoff sleep, so this returns immediately.
        expect(Date.now() - started).toBeLessThan(400);
    });

    it('accepts a Retry-After given as an HTTP date, not just seconds', async () => {
        const delays: number[] = [];
        const when = new Date(Date.now() + 4_000).toUTCString();
        const fetchImpl = flaky(1, { status: 503, headers: { 'retry-after': when } });

        await generateImage(config(), SPEC, fetchImpl, {
            attempts: 2,
            baseDelayMs: 10,
            maxDelayMs: 60_000,
            sleep: async (ms) => { delays.push(ms); },
            onRetry: () => {},
        });

        // Second resolution, so allow a little slack around the 4s target.
        expect(delays[0]).toBeGreaterThan(2_000);
        expect(delays[0]).toBeLessThanOrEqual(4_000);
    });

    it('ignores a Retry-After date already in the past instead of waiting negatively', async () => {
        const delays: number[] = [];
        const past = new Date(Date.now() - 60_000).toUTCString();
        const fetchImpl = flaky(1, { status: 503, headers: { 'retry-after': past } });

        await generateImage(config(), SPEC, fetchImpl, {
            attempts: 2,
            baseDelayMs: 10,
            maxDelayMs: 60_000,
            sleep: async (ms) => { delays.push(ms); },
            onRetry: () => {},
        });

        expect(delays).toEqual([0]);
    });

    it('falls back to backoff when Retry-After is unparseable', async () => {
        const delays: number[] = [];
        const fetchImpl = flaky(1, { status: 429, headers: { 'retry-after': 'soon-ish' } });

        await generateImage(config(), SPEC, fetchImpl, {
            attempts: 2,
            baseDelayMs: 250,
            maxDelayMs: 60_000,
            sleep: async (ms) => { delays.push(ms); },
            onRetry: () => {},
        });

        expect(delays).toEqual([250]);
    });

    it('waits the Retry-After the upstream asked for', async () => {
        const delays: number[] = [];
        const fetchImpl = flaky(1, { status: 429, headers: { 'retry-after': '3' } });

        await generateImage(config(), SPEC, fetchImpl, {
            attempts: 2,
            baseDelayMs: 10,
            maxDelayMs: 60_000,
            sleep: async (ms) => { delays.push(ms); },
            onRetry: () => {},
        });

        expect(delays).toEqual([3_000]);
    });
});
