/**
 * Cloudflare Workers AI text-to-image client.
 *
 *   POST https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{model}
 *
 * Two response shapes exist across the image models and both are handled here:
 * the Stable Diffusion family streams raw PNG bytes back with an image/*
 * content type, while flux-1-schnell answers with the standard Cloudflare
 * envelope carrying base64 in `result.image`. Sniffing the content type rather
 * than branching on the model id means a model swap via CF_IMAGE_MODEL does not
 * need a code change.
 *
 * NOTE: written against Cloudflare's documented REST contract and exercised
 * here against mocked responses only. The first live call is the real test of
 * the request/response shapes; run `pnpm generate` with credentials set.
 */

import type { WorkersAiConfig } from './config.js';
import type { PetPromptSpec } from './prompt.js';

const API_BASE = 'https://api.cloudflare.com/client/v4/accounts';

/** Flux ignores (and rejects) the SDXL-only knobs, so the request body is built
 *  per model family. Both families take `prompt` and `steps`. */
const isFlux = (model: string): boolean => model.includes('flux');

export class WorkersAiError extends Error {
    constructor(message: string, readonly status?: number) {
        super(message);
        this.name = 'WorkersAiError';
    }
}

export const buildRequestBody = (config: WorkersAiConfig, spec: PetPromptSpec): Record<string, unknown> => {
    if (isFlux(config.model)) {
        // flux-1-schnell caps steps well below SDXL's range and takes no
        // negative prompt or explicit size.
        return { prompt: spec.prompt, steps: Math.min(config.steps, 8), seed: spec.seed };
    }
    return {
        prompt: spec.prompt,
        negative_prompt: spec.negativePrompt,
        height: config.size,
        width: config.size,
        num_steps: config.steps,
        seed: spec.seed,
    };
};

interface CloudflareEnvelope {
    success?: boolean;
    errors?: { code?: number; message?: string }[];
    result?: { image?: string };
}

const describeErrors = (envelope: CloudflareEnvelope): string =>
    envelope.errors?.map((e) => e.message ?? String(e.code ?? 'unknown')).join('; ') || 'no error detail';

/** Generates one PNG. Returns the raw bytes; storage and caching are the
 *  caller's concern. */
export const generateImage = async (
    config: WorkersAiConfig,
    spec: PetPromptSpec,
    fetchImpl: typeof fetch = fetch,
): Promise<Buffer> => {
    const url = `${API_BASE}/${config.accountId}/ai/run/${config.model}`;
    const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${config.apiToken}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify(buildRequestBody(config, spec)),
        signal: AbortSignal.timeout(config.timeoutMs),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new WorkersAiError(
            `Workers AI returned ${response.status} for ${config.model}: ${detail.slice(0, 400)}`,
            response.status,
        );
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.startsWith('image/')) {
        return Buffer.from(await response.arrayBuffer());
    }

    const envelope = (await response.json()) as CloudflareEnvelope;
    if (envelope.success === false) {
        throw new WorkersAiError(`Workers AI rejected the request: ${describeErrors(envelope)}`);
    }
    const base64 = envelope.result?.image;
    if (!base64) {
        throw new WorkersAiError(
            `Workers AI returned ${contentType || 'an untyped response'} with no image payload`,
        );
    }
    return Buffer.from(base64, 'base64');
};
