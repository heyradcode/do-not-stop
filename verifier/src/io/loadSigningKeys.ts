import { readJsonFrom } from './source';
import type { TrustedSigningKey } from './types';
import { isRecord, requireString } from './util';

/**
 * Loads the trusted signing-key list from a local file or the `GET /api/battle/signing-keys`
 * URL (`{ keys: [...] }`) — or a bare array, for a hand-written trust file.
 */
export async function loadSigningKeys(source: string): Promise<TrustedSigningKey[]> {
    const json = await readJsonFrom(source);
    const list = Array.isArray(json) ? json : isRecord(json) && Array.isArray(json.keys) ? json.keys : undefined;
    if (!list) {
        throw new Error('signing-key source did not contain a key array or a { keys: [...] } object');
    }
    return list.map(normalizeKey);
}

function normalizeKey(value: unknown): TrustedSigningKey {
    if (!isRecord(value)) {
        throw new Error('a signing-key entry must be an object');
    }
    const keyId = requireString(value, 'keyId');
    const address = requireString(value, 'address');
    const key: TrustedSigningKey = { keyId, address };
    if (typeof value.notBefore === 'number') {
        key.notBefore = value.notBefore;
    }
    if (typeof value.notAfter === 'number' || value.notAfter === null) {
        key.notAfter = value.notAfter;
    }
    return key;
}
