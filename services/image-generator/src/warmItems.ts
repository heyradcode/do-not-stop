/**
 * Pre-generates art for the whole item catalog (roadmap §4).
 *
 * The pet warmer walks a token id range because pets are minted one at a time and there are
 * unboundedly many. The catalog is the opposite: a fixed, known list of 15 shared by every
 * holder, so there is no range to pass — warming means "all of them", and one run before a
 * deploy is the difference between the first player to open their bag paying a 15-inference
 * wait and every request being a cache hit.
 *
 * Sequential rather than concurrent, deliberately. Fifteen images is a one-off that takes a
 * couple of minutes, and running it flat out competes with live pet generation for the same
 * Workers AI budget; the limiter in `PipelineDeps` already bounds that, but not queueing
 * fifteen at once is simpler than relying on it.
 */

import { getOrCreateItemImage } from './itemPipeline.js';
import { ITEM_CATALOG } from './items.js';
import type { PipelineDeps } from './pipeline.js';
import { itemImageKey } from './store.js';

export type ItemWarmOutcome = 'cached' | 'generated' | 'would-generate' | 'failed';

export interface ItemWarmEvent {
    itemType: string;
    key: string;
    name: string;
    outcome: ItemWarmOutcome;
    /** Present for 'failed'. */
    error?: string;
}

export interface ItemWarmSummary {
    total: number;
    cached: number;
    generated: number;
    wouldGenerate: number;
    failed: number;
    events: ItemWarmEvent[];
}

export interface WarmItemsOptions {
    /** Report what would happen without generating anything. */
    dryRun?: boolean;
    onProgress?: (event: ItemWarmEvent) => void;
}

export const warmItems = async (
    deps: PipelineDeps,
    options: WarmItemsOptions = {},
): Promise<ItemWarmSummary> => {
    const summary: ItemWarmSummary = {
        total: 0,
        cached: 0,
        generated: 0,
        wouldGenerate: 0,
        failed: 0,
        events: [],
    };

    const record = (event: ItemWarmEvent): void => {
        summary.total += 1;
        summary.events.push(event);
        options.onProgress?.(event);
    };

    for (const item of ITEM_CATALOG) {
        const base = { itemType: item.itemType, key: item.key, name: item.name };
        try {
            // Checked directly rather than by calling the pipeline, so --dry-run cannot
            // generate: the pipeline's only honest answer to "is this cached" is to make it so.
            const existing = await deps.store.get(itemImageKey(item.itemType));
            if (existing) {
                summary.cached += 1;
                record({ ...base, outcome: 'cached' });
                continue;
            }
            if (options.dryRun) {
                summary.wouldGenerate += 1;
                record({ ...base, outcome: 'would-generate' });
                continue;
            }

            await getOrCreateItemImage(deps, item.itemType);
            summary.generated += 1;
            record({ ...base, outcome: 'generated' });
        } catch (error) {
            // One bad item must not abandon the other fourteen: a warm run is worth whatever
            // it managed, and the failure is reported rather than thrown.
            summary.failed += 1;
            record({ ...base, outcome: 'failed', error: error instanceof Error ? error.message : String(error) });
        }
    }

    return summary;
};

export const formatItemSummary = (summary: ItemWarmSummary, elapsedMs: number): string => {
    const parts = [
        `${summary.total} items`,
        `${summary.cached} cached`,
        summary.generated > 0 ? `${summary.generated} generated` : null,
        summary.wouldGenerate > 0 ? `${summary.wouldGenerate} would generate` : null,
        summary.failed > 0 ? `${summary.failed} failed` : null,
    ].filter(Boolean);
    return `${parts.join(', ')} in ${(elapsedMs / 1000).toFixed(1)}s`;
};
