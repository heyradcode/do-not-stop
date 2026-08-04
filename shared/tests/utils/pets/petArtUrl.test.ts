import { describe, it, expect } from 'vitest';
import { petArtUrl } from '../../../src/utils/pets/petArtUrl';

const SERVICE = 'https://art.example.com';

describe('petArtUrl', () => {
    it('addresses an EVM pet by its numeric id', () => {
        expect(petArtUrl({ id: '42', chain: 'evm' }, SERVICE)).toBe(
            'https://art.example.com/image/evm/42.png',
        );
    });

    it('addresses a Solana pet by its Core asset pubkey, not its id', () => {
        const url = petArtUrl(
            { id: '7', chain: 'solana', assetKey: 'Bfp1ZjoYJ8pSgWbVrpxPYMRYe7x2SxQovc821gB2Yq3w' },
            SERVICE,
        );
        expect(url).toBe(
            'https://art.example.com/image/solana/Bfp1ZjoYJ8pSgWbVrpxPYMRYe7x2SxQovc821gB2Yq3w.png',
        );
    });

    it('returns null when the service is not configured', () => {
        expect(petArtUrl({ id: '42', chain: 'evm' }, undefined)).toBeNull();
        expect(petArtUrl({ id: '42', chain: 'evm' }, '')).toBeNull();
    });

    it('returns null for a Solana pet with no asset key, which is unaddressable', () => {
        expect(petArtUrl({ id: '7', chain: 'solana' }, SERVICE)).toBeNull();
    });

    it('does not double the separator on a service URL with a trailing slash', () => {
        expect(petArtUrl({ id: '42', chain: 'evm' }, `${SERVICE}/`)).toBe(
            'https://art.example.com/image/evm/42.png',
        );
    });
});
