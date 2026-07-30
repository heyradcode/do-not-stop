import { describe, expect, it } from 'vitest';
import type { StoreSelection } from './config.js';
import { ConfigError } from './config.js';
import { FilesystemImageStore, MemoryImageStore } from './store.js';
import { createStore, describeStore } from './storeFactory.js';

const selection = (overrides: Partial<StoreSelection> = {}): StoreSelection => ({
    kind: 'memory',
    root: './.art',
    ...overrides,
});

describe('createStore', () => {
    it('builds each backend', async () => {
        expect(await createStore(selection({ kind: 'memory' }))).toBeInstanceOf(MemoryImageStore);
        expect(await createStore(selection({ kind: 'filesystem' }))).toBeInstanceOf(FilesystemImageStore);
    });

    it('builds an R2 store with credentials', async () => {
        const store = await createStore(selection({
            kind: 'r2',
            r2: {
                accountId: 'acct',
                accessKeyId: 'key',
                secretAccessKey: 'secret',
                bucket: 'art',
                publicBaseUrl: 'https://cdn.example',
            },
        }));

        expect(store.publicUrl?.('art/v1/a.png')).toBe('https://cdn.example/art/v1/a.png');
    });

    it('refuses R2 without credentials rather than failing on the first request', async () => {
        await expect(createStore(selection({ kind: 'r2' }))).rejects.toThrow(ConfigError);
    });
});

describe('describeStore', () => {
    it('names the bucket for r2 and the root for filesystem', () => {
        expect(describeStore(selection({
            kind: 'r2',
            r2: { accountId: 'a', accessKeyId: 'k', secretAccessKey: 's', bucket: 'pet-art' },
        }))).toBe('r2:pet-art');

        expect(describeStore(selection({ kind: 'filesystem', root: '/tmp/art' }))).toBe('filesystem:/tmp/art');
    });

    // The startup banner is the only place an operator sees which store is live,
    // and "memory" there means art vanishes on restart.
    it('spells out that memory does not persist', () => {
        expect(describeStore(selection({ kind: 'memory' }))).toBe('memory (nothing persists)');
    });
});
