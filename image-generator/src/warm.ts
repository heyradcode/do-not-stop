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
import { petImageKey } from './store.js';

export interface WarmOptions {
    chain: string;
    /** Inclusive id range. EVM only: Solana pets are not enumerable by number. */
    from: number;
    to: number;
    /** Report what would happen without generating anything. */
    dryRun?: boolean;
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

    for (let id = options.from; id <= options.to; id++) {
        const tokenId = String(id);
        summary.total++;

        const event = await warmOne(deps, options, tokenId);
        summary.events.push(event);

        switch (event.outcome) {
            case 'cached': summary.cached++; break;
            case 'generated': summary.generated++; break;
            case 'would-generate': summary.wouldGenerate++; break;
            case 'missing': summary.missing++; break;
            case 'failed': summary.failed++; break;
        }

        options.onProgress?.(event);
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

        // Checked before generating so a re-run after a partial failure pays only
        // for what is still missing.
        if (await deps.store.get(petImageKey(input))) return { tokenId, outcome: 'cached' };
        if (options.dryRun) return { tokenId, outcome: 'would-generate' };

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
