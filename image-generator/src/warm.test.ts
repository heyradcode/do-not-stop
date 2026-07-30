import { describe, expect, it, vi } from 'vitest';
import { UnknownPetError, type OnChainPet, type PetReader } from './chain.js';
import type { WorkersAiConfig } from './config.js';
import type { PipelineDeps } from './pipeline.js';
import { MemoryImageStore, petImageKey } from './store.js';
import { ChainNotEnumerableError, formatSummary, warmPets, type WarmDeps } from './warm.js';

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

    // Walking one pet at a time ignores the configured generation budget: a large
    // collection would take many times longer than the service can actually go.
    it('warms several pets at once, up to the configured budget', async () => {
        let live = 0;
        let peak = 0;
        const generate = vi.fn(async () => {
            live++;
            peak = Math.max(peak, live);
            await new Promise((r) => setTimeout(r, 10));
            live--;
            return Buffer.from('png');
        });
        const d = {
            ...deps(new MemoryImageStore(), reader(['1', '2', '3', '4', '5', '6'])),
            generate: generate as unknown as NonNullable<PipelineDeps['generate']>,
        };

        await warmPets(d, { chain: 'evm', from: 1, to: 6, concurrency: 3 });

        expect(generate).toHaveBeenCalledTimes(6);
        expect(peak).toBe(3);
    });

    it('never exceeds the requested concurrency', async () => {
        let live = 0;
        let peak = 0;
        const generate = vi.fn(async () => {
            live++;
            peak = Math.max(peak, live);
            await new Promise((r) => setTimeout(r, 5));
            live--;
            return Buffer.from('png');
        });
        const d = {
            ...deps(new MemoryImageStore(), reader(['1', '2', '3', '4', '5', '6'])),
            generate: generate as unknown as NonNullable<PipelineDeps['generate']>,
        };

        await warmPets(d, { chain: 'evm', from: 1, to: 6, concurrency: 1 });
        expect(peak).toBe(1);
    });

    // Progress streams as pets finish, but the summary is what gets reported at
    // the end, and out-of-order ids there would make a long run hard to read.
    it('keeps the summary in id order however completion interleaves', async () => {
        const d = deps(new MemoryImageStore(), reader(['1', '2', '3', '4', '5']));
        const summary = await warmPets(d, { chain: 'evm', from: 1, to: 5, concurrency: 5 });

        expect(summary.events.map((e) => e.tokenId)).toEqual(['1', '2', '3', '4', '5']);
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

    // Warming Solana by id range reported a tidy "not minted" summary and exited
    // 0 having warmed nothing: an operator would read that as "the collection is
    // fine" right before a launch with an entirely cold cache.
    it('refuses a chain whose pets are not addressed by number', async () => {
        const d = deps();

        await expect(warmPets(d, { chain: 'solana', from: 1, to: 5 }))
            .rejects.toThrow(ChainNotEnumerableError);
        await expect(warmPets(d, { chain: 'solana', from: 1, to: 5 }))
            .rejects.toThrow(/not addressed by number/);
    });

    it('refuses before reading the chain or generating anything', async () => {
        const d = deps();
        await warmPets(d, { chain: 'solana', from: 1, to: 5 }).catch(() => undefined);

        expect(vi.mocked(d.reader.read)).not.toHaveBeenCalled();
        expect(vi.mocked(d.generate as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
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
