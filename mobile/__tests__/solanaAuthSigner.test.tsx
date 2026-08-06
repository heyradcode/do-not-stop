/**
 * Registering the Solana signer is what makes Solana reachable at all.
 * `useActiveChain` resolves `kind: 'solana'` from this store and nothing else,
 * and `useChainAdapter` selects the Solana adapter only on that basis — so an
 * unregistered signer means a connected Solana wallet is invisible to every
 * chain-blind pet hook, and `signAndLogin` has nothing to sign with.
 *
 * The store is the real one from `@shared/core`; only AppKit is faked, since the
 * registration contract is the thing under test.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import bs58 from 'bs58';

const mockState = {
    address: 'B1aZe6PubKeyPlaceholder11111111111111111111' as string | undefined,
    isConnected: true,
    namespace: 'solana' as string | undefined,
    chainId: 'solana:devnet' as string | number | undefined,
    provider: undefined as unknown,
};

const mockRequest = jest.fn();

jest.mock('@reown/appkit-react-native', () => ({
    useProvider: () => ({ provider: mockState.provider }),
    useAccount: () => ({
        address: mockState.address,
        isConnected: mockState.isConnected,
        namespace: mockState.namespace,
        chainId: mockState.chainId,
    }),
}));

// The barrel is stubbed (it re-exports the Solana adapter and drags the whole
// Solana runtime in), but the store itself is the real one: a fake would test the
// fake. `@shared/core` exports only `.` and `./node`, so the specific modules come
// in by relative path, as elsewhere in this suite.
jest.mock('@shared/core', () => ({
    ...jest.requireActual('../../shared/src/auth/solanaAuthStore'),
    coerceSolanaEd25519SignatureBytes: jest.requireActual(
        '../../shared/src/utils/solana/signatureAuthCodec',
    ).coerceSolanaEd25519SignatureBytes,
}));

import {
    getSolanaAuthAddress,
    getSolanaAuthSigner,
    setSolanaAuthSigner,
} from '../../shared/src/auth/solanaAuthStore';
import { coerceSolanaEd25519SignatureBytes } from '../../shared/src/utils/solana/signatureAuthCodec';

import { SolanaAuthSigner } from '../src/solana/SolanaAuthSigner';
import { solanaProviderChainRef } from '../src/utils/solanaProviderChainRef';

const SIGNATURE = new Uint8Array(64).fill(7);

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<SolanaAuthSigner />);
    });
    return tree;
};

beforeEach(() => {
    mockState.address = 'B1aZe6PubKeyPlaceholder11111111111111111111';
    mockState.isConnected = true;
    mockState.namespace = 'solana';
    mockState.chainId = 'solana:devnet';
    mockRequest.mockReset();
    mockRequest.mockResolvedValue(bs58.encode(SIGNATURE));
    mockState.provider = { request: mockRequest };
    setSolanaAuthSigner(null);
});

describe('solanaProviderChainRef', () => {
    it('passes through a CAIP-2 reference unchanged', () => {
        expect(solanaProviderChainRef('solana:mainnet')).toBe('solana:mainnet');
    });

    it('namespaces a bare cluster id', () => {
        expect(solanaProviderChainRef('devnet')).toBe('solana:devnet');
        expect(solanaProviderChainRef(101)).toBe('solana:101');
    });

    it('falls back to the build target rather than producing "solana:undefined"', () => {
        expect(solanaProviderChainRef(undefined)).toBe('solana:devnet');
        expect(solanaProviderChainRef('')).toBe('solana:devnet');
    });
});

describe('SolanaAuthSigner', () => {
    it('registers the connected wallet, which is what makes useActiveChain see Solana', async () => {
        await render();
        expect(getSolanaAuthAddress()).toBe(mockState.address);
    });

    it('registers nothing for an EVM session', async () => {
        // Both namespaces share one AppKit session; registering here would make a
        // pure EVM wallet look like a Solana one to every chain-blind hook.
        mockState.namespace = 'eip155';
        await render();
        expect(getSolanaAuthSigner()).toBeNull();
    });

    it('registers nothing while disconnected or without an address', async () => {
        mockState.isConnected = false;
        await render();
        expect(getSolanaAuthSigner()).toBeNull();

        mockState.isConnected = true;
        mockState.address = undefined;
        await render();
        expect(getSolanaAuthSigner()).toBeNull();
    });

    it('clears the registration on unmount, so a stale signer cannot outlive it', async () => {
        const tree = await render();
        expect(getSolanaAuthSigner()).not.toBeNull();
        await ReactTestRenderer.act(() => {
            tree.unmount();
        });
        expect(getSolanaAuthSigner()).toBeNull();
    });

    it('signs over the wire as base58 on the session chain', async () => {
        await render();
        const message = new TextEncoder().encode('nonce-to-sign');

        const signature = await getSolanaAuthSigner()!.signMessage(message);

        expect(mockRequest).toHaveBeenCalledWith(
            {
                method: 'solana_signMessage',
                params: { message: bs58.encode(message), pubkey: mockState.address },
            },
            'solana:devnet',
        );
        expect(signature).toEqual(SIGNATURE);
    });

    it('still signs when the session reports no chain id', async () => {
        mockState.chainId = undefined;
        await render();

        await getSolanaAuthSigner()!.signMessage(new Uint8Array([1, 2, 3]));

        expect(mockRequest.mock.calls[0][1]).toBe('solana:devnet');
    });

    it.each([
        ['a bare base58 string', () => bs58.encode(SIGNATURE)],
        ['a { signature } wrapper', () => ({ signature: bs58.encode(SIGNATURE) })],
        ['raw bytes', () => SIGNATURE],
    ])('accepts %s, because wallets disagree on the shape', async (_label, make) => {
        mockRequest.mockResolvedValue(make());
        await render();
        const signature = await getSolanaAuthSigner()!.signMessage(new Uint8Array([1]));
        expect(coerceSolanaEd25519SignatureBytes(signature)).toEqual(SIGNATURE);
    });

    it('propagates a refusal rather than registering a broken signer', async () => {
        mockRequest.mockRejectedValue(new Error('User rejected'));
        await render();
        await expect(
            getSolanaAuthSigner()!.signMessage(new Uint8Array([1])),
        ).rejects.toThrow('User rejected');
    });
});
