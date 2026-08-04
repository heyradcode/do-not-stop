import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadSigningKeys } from '../../src/io/loadSigningKeys';

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'verifier-loadkeys-'));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('loadSigningKeys', () => {
    it('loads the { keys: [...] } shape GET /api/battle/signing-keys serves', async () => {
        const file = join(dir, 'keys.json');
        await writeFile(
            file,
            JSON.stringify({
                keys: [
                    { keyId: 'k1', address: '0x1111111111111111111111111111111111111111', notBefore: 100, notAfter: null },
                    { keyId: 'k2', address: '0x2222222222222222222222222222222222222222', notBefore: 200 },
                ],
            }),
        );

        const keys = await loadSigningKeys(file);
        expect(keys).toEqual([
            { keyId: 'k1', address: '0x1111111111111111111111111111111111111111', notBefore: 100, notAfter: null },
            { keyId: 'k2', address: '0x2222222222222222222222222222222222222222', notBefore: 200 },
        ]);
    });

    it('loads a bare array, for a hand-written trust file', async () => {
        const file = join(dir, 'keys-array.json');
        await writeFile(file, JSON.stringify([{ keyId: 'k1', address: '0x1111111111111111111111111111111111111111' }]));

        const keys = await loadSigningKeys(file);
        expect(keys).toEqual([{ keyId: 'k1', address: '0x1111111111111111111111111111111111111111' }]);
    });

    it('throws when the source is neither a key array nor a { keys: [...] } object', async () => {
        const file = join(dir, 'bad.json');
        await writeFile(file, JSON.stringify({ notKeys: [] }));
        await expect(loadSigningKeys(file)).rejects.toThrow(/did not contain a key array/);
    });

    it('throws when a key entry is missing its address', async () => {
        const file = join(dir, 'missing-address.json');
        await writeFile(file, JSON.stringify({ keys: [{ keyId: 'k1' }] }));
        await expect(loadSigningKeys(file)).rejects.toThrow(/address/);
    });
});
