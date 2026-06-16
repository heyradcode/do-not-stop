import { describe, expect, it, vi, beforeEach } from 'vitest';

// Use the in-memory store by keeping REDIS_URL unset.
vi.mock('@config/redis', () => ({ getRedis: vi.fn().mockResolvedValue(null) }));
vi.mock('@features/dialogue/result/pregen.types', () => ({
    PREGEN_TTL_MS: 60_000,
    PREGEN_TTL_SEC: 60,
}));

// Reset the module between tests so each suite gets a fresh singleton store.
import { getPregenStore } from '../../src/repositories/pregen.repository';
import type { PregenDialogue } from '../../src/features/dialogue/result/pregen.types';

const payload: PregenDialogue = {
    attackerWins: [{ speaker: 'attacker', text: 'I win!', phase: 'result' }],
    defenderWins: [{ speaker: 'defender', text: 'I win!', phase: 'result' }],
    model: 'test-model',
};

// Each test gets a fresh store via the reset mechanism.
beforeEach(async () => {
    // Force a new store instance by re-importing with a reset.
    vi.resetModules();
});

describe('InMemoryPregenStore', () => {
    it('reserve returns true for a new key', async () => {
        const { getPregenStore: fresh } = await import('../../src/repositories/pregen.repository');
        const store = await fresh();
        expect(await store.reserve('key1')).toBe(true);
    });

    it('reserve returns false for an already-reserved key', async () => {
        const { getPregenStore: fresh } = await import('../../src/repositories/pregen.repository');
        const store = await fresh();
        await store.reserve('key2');
        expect(await store.reserve('key2')).toBe(false);
    });

    it('take returns null when key was never reserved', async () => {
        const { getPregenStore: fresh } = await import('../../src/repositories/pregen.repository');
        const store = await fresh();
        expect(await store.take('missing')).toBeNull();
    });

    it('fulfill then take returns the payload and removes the entry', async () => {
        const { getPregenStore: fresh } = await import('../../src/repositories/pregen.repository');
        const store = await fresh();
        await store.reserve('key3');
        await store.fulfill('key3', payload);
        const result = await store.take('key3');
        expect(result?.model).toBe('test-model');
        // Second take should return null (consumed).
        expect(await store.take('key3')).toBeNull();
    });

    it('release drops the reservation so it can be re-claimed', async () => {
        const { getPregenStore: fresh } = await import('../../src/repositories/pregen.repository');
        const store = await fresh();
        await store.reserve('key4');
        await store.release('key4');
        expect(await store.reserve('key4')).toBe(true);
    });

    it('take returns null after release (promise rejects)', async () => {
        const { getPregenStore: fresh } = await import('../../src/repositories/pregen.repository');
        const store = await fresh();
        await store.reserve('key5');
        await store.release('key5');
        expect(await store.take('key5')).toBeNull();
    });
});
