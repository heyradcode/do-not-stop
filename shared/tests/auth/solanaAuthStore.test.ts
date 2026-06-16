import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    getSolanaAuthAddress,
    getSolanaAuthSigner,
    setSolanaAuthSigner,
    subscribeSolanaAuth,
    type SolanaAuthSigner,
} from '../../src/auth/solanaAuthStore';

const makeSigner = (address: string): SolanaAuthSigner => ({
    getAddress: () => address,
    signMessage: async () => new Uint8Array(),
});

// Module-level singleton — reset between tests.
afterEach(() => setSolanaAuthSigner(null));

describe('solanaAuthStore', () => {
    it('starts with no signer', () => {
        expect(getSolanaAuthSigner()).toBeNull();
        expect(getSolanaAuthAddress()).toBeNull();
    });

    it('stores a signer and exposes its address', () => {
        const signer = makeSigner('SoLAddr');
        setSolanaAuthSigner(signer);

        expect(getSolanaAuthSigner()).toBe(signer);
        expect(getSolanaAuthAddress()).toBe('SoLAddr');
    });

    it('clears the signer when set to null', () => {
        setSolanaAuthSigner(makeSigner('SoLAddr'));
        setSolanaAuthSigner(null);

        expect(getSolanaAuthSigner()).toBeNull();
        expect(getSolanaAuthAddress()).toBeNull();
    });

    it('notifies subscribers on change and stops after unsubscribe', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeSolanaAuth(listener);

        setSolanaAuthSigner(makeSigner('A'));
        expect(listener).toHaveBeenCalledTimes(1);

        setSolanaAuthSigner(makeSigner('B'));
        expect(listener).toHaveBeenCalledTimes(2);

        unsubscribe();
        setSolanaAuthSigner(null);
        expect(listener).toHaveBeenCalledTimes(2);
    });
});
