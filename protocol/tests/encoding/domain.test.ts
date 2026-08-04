import { describe, expect, it } from 'vitest';

import { DOMAIN_TAGS } from '../../src/encoding/domain';

describe('domain tags', () => {
    it('are unique', () => {
        // A duplicate tag reintroduces exactly the cross-object confusion the tags
        // exist to prevent, and it would do so silently.
        const values = Object.values(DOMAIN_TAGS);
        expect(new Set(values).size).toBe(values.length);
    });

    it('pin the seed tag the architecture document fixed', () => {
        // §E specifies this string. Changing it changes every battle seed.
        expect(DOMAIN_TAGS.SEED).toBe('CRYPTOPETS_BATTLE_V1');
    });

    it('are versioned ASCII identifiers', () => {
        for (const tag of Object.values(DOMAIN_TAGS)) {
            expect(tag).toMatch(/^CRYPTOPETS_[A-Z0-9_]+_V\d+$/);
        }
    });
});
