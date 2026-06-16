import { describe, expect, it } from 'vitest';

import { PET_ACCOUNT_OWNER_MEMCMP_OFFSET } from '../../../src/utils/solana/constants';

describe('solana constants', () => {
    it('offsets the owner field past the discriminator and id', () => {
        // 8-byte discriminator + 4-byte id
        expect(PET_ACCOUNT_OWNER_MEMCMP_OFFSET).toBe(12);
    });
});
