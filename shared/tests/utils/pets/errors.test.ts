import { describe, expect, it } from 'vitest';

import { NoActiveChainError } from '../../../src/utils/pets/errors';

describe('NoActiveChainError', () => {
    it('is an Error with a named, action-specific message', () => {
        const err = new NoActiveChainError('feed');

        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('NoActiveChainError');
        expect(err.message).toBe('Action "feed" requires a connected wallet.');
    });
});
