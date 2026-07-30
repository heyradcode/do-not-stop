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
import { DEFAULT_RETRY, withRetry, type RetryOptions } from './retry.js';

const API_BASE = 'https://api.cloudflare.com/client/v4/accounts';

/** Flux ignores (and rejects) the SDXL-only knobs, so the request body is built
 *  per model family. Both families take `prompt` and `steps`. */
const isFlux = (model: string): boolean => model.includes('flux');

export class WorkersAiError extends Error {
    /** True when another attempt could plausibly succeed (see retry.ts). */
    readonly retryable: boolean;
    // Explicitly `| undefined` rather than optional: under
    // exactOptionalPropertyTypes an optional property cannot be assigned
    // undefined, and both of these are genuinely absent much of the time.
    readonly status: number | undefined;
    readonly retryAfterMs: number | undefined;

    constructor(message: string, options: { status?: number; retryable?: boolean; retryAfterMs?: number } = {}) {
        super(message);
        this.name = 'WorkersAiError';
        this.status = options.status;
        this.retryable = options.retryable ?? false;
        this.retryAfterMs = options.retryAfterMs;
    }
}

/** 429 is a rate limit and 5xx is an upstream wobble; both are worth retrying.
 *  A 4xx other than 429 means the request itself is wrong, so retrying it would
 *  just burn the same error again. */
const isRetryableStatus = (status: number): boolean => status === 429 || status >= 500;

/** Retry-After is either seconds or an HTTP date. */
const parseRetryAfter = (header: string | null): number | undefined => {
    if (!header) return undefined;
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(header);
    return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
};

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

/** One attempt. generateImage wraps this in retry/backoff. */
const attemptGenerate = async (
    config: WorkersAiConfig,
    spec: PetPromptSpec,
    fetchImpl: typeof fetch,
): Promise<Buffer> => {
    const url = `${API_BASE}/${config.accountId}/ai/run/${config.model}`;

    let response: Response;
    try {
        response = await fetchImpl(url, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${config.apiToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify(buildRequestBody(config, spec)),
            signal: AbortSignal.timeout(config.timeoutMs),
        });
    } catch (error) {
        // A transport failure or timeout never produced an image, so it is always
        // safe to try again.
        throw new WorkersAiError(
            `Workers AI request failed: ${error instanceof Error ? error.message : String(error)}`,
            { retryable: true },
        );
    }

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
        throw new WorkersAiError(
            `Workers AI returned ${response.status} for ${config.model}: ${detail.slice(0, 400)}`,
            {
                status: response.status,
                retryable: isRetryableStatus(response.status),
                ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
            },
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

/** Generates one PNG, retrying rate limits and upstream wobbles. Returns the raw
 *  bytes; storage and caching are the caller's concern. */
export const generateImage = async (
    config: WorkersAiConfig,
    spec: PetPromptSpec,
    fetchImpl: typeof fetch = fetch,
    retry: RetryOptions = DEFAULT_RETRY,
): Promise<Buffer> =>
    withRetry(() => attemptGenerate(config, spec, fetchImpl), {
        ...retry,
        onRetry: retry.onRetry
            ?? ((attempt, delayMs, error) => {
                console.warn(
                    `workers ai attempt ${attempt} failed, retrying in ${delayMs}ms:`,
                    error instanceof Error ? error.message : error,
                );
            }),
    });
