import { describe, expect, it, vi } from 'vitest';
import { UnknownPetError, type OnChainPet, type PetReader } from './chain.js';
import { checkReadiness } from './readiness.js';
import { MemoryImageStore, type ImageStore } from './store.js';

const PET: OnChainPet = {
    tokenId: '1',
    name: 'Sparky',
    dna: 79_34_05_61_88_13_42_07n,
    rarity: 3,
    speciesId: 6,
    level: 1,
    generation: 0,
    winCount: 0,
    lossCount: 0,
};

const okReader = (): PetReader => ({ read: vi.fn(async () => PET) });

const throwingReader = (error: Error): PetReader => ({
    read: vi.fn(async () => { throw error; }),
});

const brokenStore = (error: Error): ImageStore => ({
    get: vi.fn(async () => { throw error; }),
    put: vi.fn(async () => {}),
});

const statusOf = (report: Awaited<ReturnType<typeof checkReadiness>>, name: string) =>
    report.checks.find((c) => c.name === name);

describe('checkReadiness', () => {
    it('is ready when both the store and the chain answer', async () => {
        const report = await checkReadiness({ store: new MemoryImageStore(), reader: okReader() });

        expect(report.ready).toBe(true);
        expect(report.checks.map((c) => c.name)).toEqual(['store', 'chain:evm']);
        expect(report.checks.every((c) => c.ok)).toBe(true);
    });

    // The probe asks for a pet that may not exist; an answer of "no such pet"
    // still proves the RPC is reachable and the contract decodes.
    it('treats an unknown pet as a reachable chain', async () => {
        const report = await checkReadiness({
            store: new MemoryImageStore(),
            reader: throwingReader(new UnknownPetError('1')),
        });

        expect(report.ready).toBe(true);
        expect(statusOf(report, 'chain:evm')?.ok).toBe(true);
    });

    it('is not ready when the RPC is unreachable', async () => {
        const report = await checkReadiness({
            store: new MemoryImageStore(),
            reader: throwingReader(new Error('fetch failed: ECONNREFUSED')),
        });

        expect(report.ready).toBe(false);
        expect(statusOf(report, 'chain:evm')).toMatchObject({ ok: false });
        expect(statusOf(report, 'chain:evm')?.error).toContain('ECONNREFUSED');
        // The store was fine; a readiness report has to say which half broke.
        expect(statusOf(report, 'store')?.ok).toBe(true);
    });

    // The failure this exists to catch: wrong R2 credentials boot fine and only
    // fail once a real image is requested.
    it('is not ready when the store rejects access', async () => {
        const report = await checkReadiness({
            store: brokenStore(new Error('AccessDenied')),
            reader: okReader(),
        });

        expect(report.ready).toBe(false);
        expect(statusOf(report, 'store')?.error).toContain('AccessDenied');
        expect(statusOf(report, 'chain:evm')?.ok).toBe(true);
    });

    it('reports both failures rather than stopping at the first', async () => {
        const report = await checkReadiness({
            store: brokenStore(new Error('AccessDenied')),
            reader: throwingReader(new Error('ECONNREFUSED')),
        });

        expect(report.ready).toBe(false);
        expect(report.checks.every((c) => !c.ok)).toBe(true);
    });

    it('probes with a key nothing writes, so it cannot be satisfied by real data', async () => {
        const store = new MemoryImageStore();
        const spy = vi.spyOn(store, 'get');
        await checkReadiness({ store, reader: okReader() });

        expect(spy).toHaveBeenCalledWith('health/probe');
    });

    it('defaults to evm, which every deployment configures', async () => {
        const reader = okReader();
        const report = await checkReadiness({ store: new MemoryImageStore(), reader });

        expect(vi.mocked(reader.read)).toHaveBeenCalledWith('evm', '1');
        expect(report.checks.map((c) => c.name)).toEqual(['store', 'chain:evm']);
    });

    // Checking one chain while serving two lets a deployment whose second RPC is
    // unreachable pass readiness and then fail every request for that chain.
    it('probes every configured chain, not just the first', async () => {
        const reader = okReader();
        const report = await checkReadiness({
            store: new MemoryImageStore(),
            reader,
            probeChains: ['evm', 'solana'],
        });

        expect(report.checks.map((c) => c.name)).toEqual(['store', 'chain:evm', 'chain:solana']);
        expect(vi.mocked(reader.read)).toHaveBeenCalledTimes(2);
    });

    // A Solana id is a base58 pubkey; '1' is not one, so the reader would reject
    // it before the network and the probe would prove nothing.
    it('probes Solana with a real pubkey so the request reaches the cluster', async () => {
        const reader = okReader();
        await checkReadiness({ store: new MemoryImageStore(), reader, probeChains: ['solana'] });

        const [chain, tokenId] = vi.mocked(reader.read).mock.calls[0]!;
        expect(chain).toBe('solana');
        expect(tokenId).toBe('11111111111111111111111111111111');
        expect(tokenId).toHaveLength(32);
    });

    it('is not ready when one chain of two is down', async () => {
        const reader: PetReader = {
            read: vi.fn(async (chain: string) => {
                if (chain === 'solana') throw new Error('getProgramAccounts is disabled');
                return PET;
            }),
        };

        const report = await checkReadiness({
            store: new MemoryImageStore(),
            reader,
            probeChains: ['evm', 'solana'],
        });

        expect(report.ready).toBe(false);
        expect(report.checks.find((c) => c.name === 'chain:evm')?.ok).toBe(true);
        expect(report.checks.find((c) => c.name === 'chain:solana')?.ok).toBe(false);
    });

    it('times each dependency separately', async () => {
        const report = await checkReadiness({ store: new MemoryImageStore(), reader: okReader() });
        for (const check of report.checks) expect(check.ms).toBeGreaterThanOrEqual(0);
    });

    it('runs the probes concurrently, not one after the other', async () => {
        const slow = <T>(value: T) => new Promise<T>((r) => setTimeout(() => r(value), 60));
        const store: ImageStore = { get: async () => slow(null), put: async () => {} };
        const reader: PetReader = { read: async () => slow(PET) };

        const started = Date.now();
        await checkReadiness({ store, reader });

        // Sequential would be ~120ms; allow slack but not a doubling.
        expect(Date.now() - started).toBeLessThan(110);
    });
});
