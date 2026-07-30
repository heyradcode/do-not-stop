import { describe, expect, it, vi } from 'vitest';
import { UnknownPetError, type OnChainPet, type PetReader } from './chain.js';
import type { WorkersAiConfig } from './config.js';
import type { PipelineDeps } from './pipeline.js';
import { MemoryImageStore, petImageKey } from './store.js';
import { formatSummary, warmPets, type WarmDeps } from './warm.js';

const CONFIG: WorkersAiConfig = {
    accountId: 'acct',
    apiToken: 'token',
    model: '@cf/bytedance/stable-diffusion-xl-lightning',
    apiBase: 'https://api.cloudflare.com/client/v4/accounts',
    size: 1024,
    steps: 8,
    timeoutMs: 5_000,
    attempts: 1,
    maxConcurrent: 2,
};

/** Distinct dna per id, so each pet gets its own cache key. */
const petFor = (tokenId: string): OnChainPet => ({
    tokenId,
    name: `Pet ${tokenId}`,
    dna: BigInt(tokenId) * 1_111_111_111_111n + 7n,
    rarity: 3,
    speciesId: 2,
    level: 1,
    generation: 0,
    winCount: 0,
    lossCount: 0,
});

const artInput = (tokenId: string) => {
    const pet = petFor(tokenId);
    return {
        dna: pet.dna,
        rarity: pet.rarity,
        ...(pet.speciesId === undefined ? {} : { speciesId: pet.speciesId }),
    };
};

/** Minted ids 1..3; anything else is unminted. */
const reader = (minted = ['1', '2', '3'], failOn: Record<string, Error> = {}): PetReader => ({
    read: vi.fn(async (_chain: string, tokenId: string) => {
        const failure = failOn[tokenId];
        if (failure) throw failure;
        if (!minted.includes(tokenId)) throw new UnknownPetError(tokenId);
        return petFor(tokenId);
    }),
});

type TestDeps = WarmDeps & { store: MemoryImageStore; generate: NonNullable<PipelineDeps['generate']> };

const deps = (store = new MemoryImageStore(), reader_ = reader()): TestDeps => {
    let calls = 0;
    // A spy, so tests can assert generation did NOT happen; and distinct bytes per
    // call, so nothing passes by two generations coincidentally matching.
    const generate = vi.fn(async () => Buffer.from(`image-${++calls}`));
    return {
        config: CONFIG,
        store,
        reader: reader_,
        generate: generate as unknown as NonNullable<PipelineDeps['generate']>,
    };
};

describe('warmPets', () => {
    it('generates art for every minted pet in the range', async () => {
        const d = deps();
        const summary = await warmPets(d, { chain: 'evm', from: 1, to: 3 });

        expect(summary).toMatchObject({ total: 3, generated: 3, cached: 0, missing: 0, failed: 0 });
        for (const id of ['1', '2', '3']) {
            expect(await d.store.get(petImageKey(artInput(id)))).not.toBeNull();
        }
    });

    it('counts unminted ids as missing rather than failures', async () => {
        // Warming past the current supply is routine, not an error.
        const summary = await warmPets(deps(), { chain: 'evm', from: 1, to: 6 });

        expect(summary).toMatchObject({ total: 6, generated: 3, missing: 3, failed: 0 });
    });

    it('skips pets that already have art, so a re-run costs nothing', async () => {
        const store = new MemoryImageStore();
        const first = deps(store);
        await warmPets(first, { chain: 'evm', from: 1, to: 3 });

        const second = deps(store);
        const generate = vi.mocked(second.generate as unknown as ReturnType<typeof vi.fn>);
        const summary = await warmPets(second, { chain: 'evm', from: 1, to: 3 });

        expect(summary).toMatchObject({ cached: 3, generated: 0 });
        expect(generate).not.toHaveBeenCalled();
    });

    it('keeps going after a failure and reports it, rather than aborting a paid run', async () => {
        const store = new MemoryImageStore();
        const d = deps(store, reader(['1', '2', '3'], { 2: new Error('rpc timeout') }));

        const summary = await warmPets(d, { chain: 'evm', from: 1, to: 3 });

        expect(summary).toMatchObject({ generated: 2, failed: 1 });
        expect(summary.events.find((e) => e.tokenId === '2')).toMatchObject({
            outcome: 'failed',
            error: 'rpc timeout',
        });
        // The pets either side of the failure were still generated.
        expect(await store.get(petImageKey(artInput('1')))).not.toBeNull();
        expect(await store.get(petImageKey(artInput('3')))).not.toBeNull();
    });

    it('is resumable: a second run fills only what the first missed', async () => {
        const store = new MemoryImageStore();
        await warmPets(
            deps(store, reader(['1', '2', '3'], { 2: new Error('rpc timeout') })),
            { chain: 'evm', from: 1, to: 3 },
        );

        const summary = await warmPets(deps(store), { chain: 'evm', from: 1, to: 3 });
        expect(summary).toMatchObject({ cached: 2, generated: 1, failed: 0 });
    });

    it('generates nothing on a dry run, but still reports what it would do', async () => {
        const d = deps();
        const generate = vi.mocked(d.generate as unknown as ReturnType<typeof vi.fn>);

        const summary = await warmPets(d, { chain: 'evm', from: 1, to: 6, dryRun: true });

        expect(summary).toMatchObject({ wouldGenerate: 3, missing: 3, generated: 0 });
        expect(generate).not.toHaveBeenCalled();
        expect(d.store.size).toBe(0);
    });

    it('reports dry-run pets that already have art as cached, not as work to do', async () => {
        const store = new MemoryImageStore();
        await warmPets(deps(store), { chain: 'evm', from: 1, to: 1 });

        const summary = await warmPets(deps(store), { chain: 'evm', from: 1, to: 3, dryRun: true });
        expect(summary).toMatchObject({ cached: 1, wouldGenerate: 2 });
    });

    it('streams progress as it goes', async () => {
        const events: string[] = [];
        await warmPets(deps(), {
            chain: 'evm',
            from: 1,
            to: 2,
            onProgress: (e) => events.push(`${e.tokenId}:${e.outcome}`),
        });

        expect(events).toEqual(['1:generated', '2:generated']);
    });

    it('handles an empty range without touching the chain', async () => {
        const d = deps();
        const summary = await warmPets(d, { chain: 'evm', from: 5, to: 4 });

        expect(summary.total).toBe(0);
        expect(vi.mocked(d.reader.read)).not.toHaveBeenCalled();
    });
});

describe('formatSummary', () => {
    it('lists failures rather than only counting them', async () => {
        const summary = await warmPets(
            deps(new MemoryImageStore(), reader(['1'], { 1: new Error('boom') })),
            { chain: 'evm', from: 1, to: 1 },
        );

        const text = formatSummary(summary, 1_500);
        expect(text).toContain('failed       1');
        expect(text).toContain('1: boom');
        expect(text).toContain('elapsed      2s');
    });

    it('shows generated counts on a real run and would-generate on a dry one', async () => {
        const real = await warmPets(deps(), { chain: 'evm', from: 1, to: 3 });
        expect(formatSummary(real, 0)).toContain('generated    3');

        const dry = await warmPets(deps(), { chain: 'evm', from: 1, to: 3, dryRun: true });
        expect(formatSummary(dry, 0)).toContain('would gen    3');
    });
});
