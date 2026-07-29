import { describe, it, expect, vi } from 'vitest';
import type { WorkersAiConfig } from './config.js';
import { buildPetPrompt } from './prompt.js';
import { derivePetVisualTraits } from './traits.js';
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
    ...overrides,
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const respond = (body: BodyInit, init: ResponseInit): typeof fetch =>
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

    it('omits SDXL-only fields and caps steps for flux', () => {
        const body = buildRequestBody(
            config({ model: '@cf/black-forest-labs/flux-1-schnell', steps: 20 }),
            SPEC,
        );

        expect(body).toEqual({ prompt: SPEC.prompt, steps: 8, seed: SPEC.seed });
        expect(body).not.toHaveProperty('negative_prompt');
        expect(body).not.toHaveProperty('width');
    });
});

describe('generateImage', () => {
    it('posts to the account/model run endpoint with the bearer token', async () => {
        const fetchImpl = respond(PNG, { headers: { 'content-type': 'image/png' } });
        await generateImage(config(), SPEC, fetchImpl);

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
        const fetchImpl = respond('quota exceeded', { status: 429, headers: { 'content-type': 'text/plain' } });

        await expect(generateImage(config(), SPEC, fetchImpl)).rejects.toThrow(WorkersAiError);
        await expect(generateImage(config(), SPEC, fetchImpl)).rejects.toThrow(/429.*quota exceeded/s);
    });

    it('reports Cloudflare-level failures that arrive with HTTP 200', async () => {
        const fetchImpl = respond(
            JSON.stringify({ success: false, errors: [{ code: 3036, message: 'Account limited' }] }),
            { headers: { 'content-type': 'application/json' } },
        );

        await expect(generateImage(config(), SPEC, fetchImpl)).rejects.toThrow(/Account limited/);
    });

    it('rejects a success envelope with no image', async () => {
        const fetchImpl = respond(JSON.stringify({ success: true, result: {} }), {
            headers: { 'content-type': 'application/json' },
        });

        await expect(generateImage(config(), SPEC, fetchImpl)).rejects.toThrow(/no image payload/);
    });
});
