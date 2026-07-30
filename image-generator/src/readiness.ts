/**
 * Readiness checks, as distinct from liveness.
 *
 * `/health` answers "this process is running" and touches nothing external, so a
 * platform restarting unhealthy instances never restarts one over a transient
 * upstream blip. `/ready` answers "this instance can actually serve an image",
 * which means proving the two dependencies that silently break a deploy:
 *
 * - **The store.** Wrong R2 credentials or a missing bucket boot perfectly well
 *   and then fail on the first image, after the deploy has been declared good.
 * - **The chain RPC.** Same shape: a bad URL is invisible until a request needs it.
 *
 * The chain probe reads a real token id and treats "no such pet" as success: any
 * answer at all proves the RPC is reachable and the contract address decodes, and
 * asking for a pet that may not exist is cheaper than requiring one that does.
 * Only a transport-level failure counts as not ready.
 */

import { UnknownPetError, type PetReader } from './chain.js';
import type { ImageStore } from './store.js';

/** A key nothing ever writes: the probe wants a clean miss, not a real object. */
const PROBE_KEY = 'health/probe';

/** Any minted collection has id 1; if it does not, UnknownPetError still proves
 *  the RPC answered, which is all this checks. */
const PROBE_TOKEN_ID = '1';

export interface DependencyStatus {
    name: string;
    ok: boolean;
    /** Present when ok is false. */
    error?: string;
    ms: number;
}

export interface ReadinessReport {
    ready: boolean;
    checks: DependencyStatus[];
}

export interface ReadinessDeps {
    store: ImageStore;
    reader: PetReader;
    /** Chain to probe. Defaults to evm, the only one every deployment configures. */
    probeChain?: string;
}

const timed = async (name: string, probe: () => Promise<void>): Promise<DependencyStatus> => {
    const started = Date.now();
    try {
        await probe();
        return { name, ok: true, ms: Date.now() - started };
    } catch (error) {
        return {
            name,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            ms: Date.now() - started,
        };
    }
};

export const checkReadiness = async (deps: ReadinessDeps): Promise<ReadinessReport> => {
    // Run together: a readiness probe should not take store-latency plus
    // rpc-latency when it can take the larger of the two.
    const checks = await Promise.all([
        timed('store', async () => {
            // ImageStore.get must return null for a miss rather than throwing, so
            // anything thrown here is a real access failure: bad credentials, a
            // missing bucket, an unreachable endpoint.
            await deps.store.get(PROBE_KEY);
        }),
        timed('chain', async () => {
            try {
                await deps.reader.read(deps.probeChain ?? 'evm', PROBE_TOKEN_ID);
            } catch (error) {
                // The RPC answered, which is the whole question.
                if (error instanceof UnknownPetError) return;
                throw error;
            }
        }),
    ]);

    return { ready: checks.every((check) => check.ok), checks };
};
