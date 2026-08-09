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
 *  the RPC answered, which is all this checks. On Solana an id is a base58 asset
 *  pubkey, so '1' is not one: the reader rejects it before the network, which
 *  would prove nothing. The system-program address is a real pubkey that no pet
 *  will ever be, so it reaches the RPC and comes back as "no such pet". */
const PROBE_TOKEN_ID: Record<string, string> = {
    evm: '1',
    solana: '11111111111111111111111111111111',
};

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
    /** Every chain this deployment serves. All are probed: readiness claims the
     *  instance can serve an image, and checking only one chain would let a
     *  deployment whose second RPC is unreachable pass and then fail every
     *  request for that chain. */
    probeChains?: string[];
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
    const chains = deps.probeChains?.length ? deps.probeChains : ['evm'];

    // Run together: a readiness probe should not take store-latency plus
    // rpc-latency, nor one chain after another, when it can take the slowest.
    const checks = await Promise.all([
        timed('store', async () => {
            // ImageStore.get must return null for a miss rather than throwing, so
            // anything thrown here is a real access failure: bad credentials, a
            // missing bucket, an unreachable endpoint.
            await deps.store.get(PROBE_KEY);
        }),
        ...chains.map((chain) => timed(`chain:${chain}`, async () => {
            try {
                await deps.reader.read(chain, PROBE_TOKEN_ID[chain] ?? '1');
            } catch (error) {
                // The RPC answered, which is the whole question.
                if (error instanceof UnknownPetError) return;
                throw error;
            }
        })),
    ]);

    return { ready: checks.every((check) => check.ok), checks };
};
