/**
 * Pre-generates art for a range of pets, so a collection is warm before anything
 * points at it.
 *
 * Art is generated on first fetch (see pipeline.ts), which means the first
 * marketplace crawl after `tokenURI` starts resolving here arrives at a cold
 * cache: every image at once, all of them misses. Warming ahead of time turns
 * that into cache hits, and moves the spend somewhere it can be watched.
 *
 * Two properties matter more than speed:
 *
 * - **One pet's failure does not stop the run.** A gap in the id range, a pet
 *   burned, an RPC hiccup: each is recorded and the walk continues. Aborting
 *   midway through a paid batch would be the worst outcome, since the work
 *   already done is fine and only the remainder is in question.
 * - **Already-generated pets are never regenerated.** The store is checked before
 *   any inference, so re-running after a partial failure costs only the pets that
 *   are actually missing. Runs are resumable by construction.
 */

import type { PetReader } from './chain.js';
import { UnknownPetError } from './chain.js';
import { getOrCreatePetImage, type PipelineDeps } from './pipeline.js';
import { createLimiter } from './retry.js';
import { petImageKey } from './store.js';

export interface WarmOptions {
    chain: string;
    /** Inclusive id range. EVM only: Solana pets are not enumerable by number. */
    from: number;
    to: number;
    /** Report what would happen without generating anything. */
    dryRun?: boolean;
    /** Pets in flight at once. Defaults to the service's own generation budget,
     *  CF_MAX_CONCURRENT, so warming uses exactly the capacity a live instance
     *  would. */
    concurrency?: number;
    onProgress?: (event: WarmEvent) => void;
}

export type WarmOutcome = 'cached' | 'generated' | 'would-generate' | 'missing' | 'failed';

export interface WarmEvent {
    tokenId: string;
    outcome: WarmOutcome;
    /** Present for 'failed'. */
    error?: string;
}

export interface WarmSummary {
    total: number;
    cached: number;
    generated: number;
    wouldGenerate: number;
    missing: number;
    failed: number;
    events: WarmEvent[];
}

export interface WarmDeps extends PipelineDeps {
    reader: PetReader;
}

export const warmPets = async (deps: WarmDeps, options: WarmOptions): Promise<WarmSummary> => {
    const summary: WarmSummary = {
        total: 0,
        cached: 0,
        generated: 0,
        wouldGenerate: 0,
        missing: 0,
        failed: 0,
        events: [],
    };

    const ids: string[] = [];
    for (let id = options.from; id <= options.to; id++) ids.push(String(id));

    // Walking one pet at a time ignores the generation budget the service is
    // configured for: a 10k collection at a few seconds an image takes most of a
    // day serially. The pipeline's own limiter still caps concurrent inferences,
    // so this pool controls how many pets are in flight, not how much is billed
    // at once.
    const limiter = createLimiter(options.concurrency ?? deps.config.maxConcurrent);

    // warmOne never throws: a failure is an event, so one bad pet cannot reject
    // the batch and abandon the pets after it.
    const events = await Promise.all(ids.map((tokenId) => limiter.run(async () => {
        const event = await warmOne(deps, options, tokenId);
        // Streamed as it completes, so a long run shows progress. Order follows
        // completion, while the summary below stays in id order.
        options.onProgress?.(event);
        return event;
    })));

    for (const event of events) {
        summary.total++;
        summary.events.push(event);

        switch (event.outcome) {
            case 'cached': summary.cached++; break;
            case 'generated': summary.generated++; break;
            case 'would-generate': summary.wouldGenerate++; break;
            case 'missing': summary.missing++; break;
            case 'failed': summary.failed++; break;
        }
    }

    return summary;
};

const warmOne = async (deps: WarmDeps, options: WarmOptions, tokenId: string): Promise<WarmEvent> => {
    try {
        const pet = await deps.reader.read(options.chain, tokenId);
        const input = {
            dna: pet.dna,
            rarity: pet.rarity,
            ...(pet.speciesId === undefined ? {} : { speciesId: pet.speciesId }),
        };

        // Dry runs need their own store lookup, since nothing else is going to
        // ask. A real run does not: getOrCreatePetImage checks the store before
        // generating and reports whether it hit, so a pre-check here would be a
        // second read of the same key for every pet, which against R2 is a
        // network round-trip per pet in the collection.
        if (options.dryRun) {
            return await deps.store.get(petImageKey(input))
                ? { tokenId, outcome: 'cached' }
                : { tokenId, outcome: 'would-generate' };
        }

        // Resumable by construction: the pipeline pays only for what is missing,
        // so re-running after a partial failure costs nothing for what succeeded.
        const result = await getOrCreatePetImage(deps, input);
        return { tokenId, outcome: result.cached ? 'cached' : 'generated' };
    } catch (error) {
        // A gap in the range is expected, not a failure: ids are not dense once
        // pets can be burned, and callers routinely warm past the current supply.
        if (error instanceof UnknownPetError) return { tokenId, outcome: 'missing' };

        return {
            tokenId,
            outcome: 'failed',
            error: error instanceof Error ? error.message : String(error),
        };
    }
};

export const formatSummary = (summary: WarmSummary, elapsedMs: number): string => {
    const lines = [
        `scanned      ${summary.total}`,
        `already art  ${summary.cached}`,
        summary.wouldGenerate > 0 ? `would gen    ${summary.wouldGenerate}` : `generated    ${summary.generated}`,
        `not minted   ${summary.missing}`,
        `failed       ${summary.failed}`,
        `elapsed      ${Math.round(elapsedMs / 1000)}s`,
    ];

    // Failures are listed rather than just counted: a run that quietly reports
    // "12 failed" gives no way to tell an RPC blip from a bad deploy.
    if (summary.failed > 0) {
        lines.push('', 'failures:');
        for (const event of summary.events.filter((e) => e.outcome === 'failed')) {
            lines.push(`  ${event.tokenId}: ${event.error}`);
        }
    }

    return lines.join('\n');
};
