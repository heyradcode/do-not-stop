// @vitest-environment jsdom
import React from 'react';
import { renderHook } from '@testing-library/react';
import { Keypair } from '@solana/web3.js';
import type { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import type { AxiosInstance } from 'axios';
import type { Abi } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAuthApiClient } = vi.hoisted(() => ({
    createAuthApiClient: vi.fn(),
}));

vi.mock('../src/api', () => ({
    createAuthApiClient,
}));

vi.stubGlobal('React', React);

import {
    ApiClientProvider,
    useApiClient,
} from '../src/contexts/ApiClientContext';
import {
    PetsConfigProvider,
    usePetsConfig,
    type PetsEvmConfig,
} from '../src/contexts/PetsConfigContext';
import {
    SolanaAnchorProvider,
    useSolanaAnchor,
    type SolanaSigningWallet,
} from '../src/contexts/SolanaAnchorContext';

const makeApiClient = (baseURL: string) => ({ defaults: { baseURL } }) as AxiosInstance;

describe('ApiClientContext', () => {
    beforeEach(() => {
        createAuthApiClient.mockReset();
    });

    it('throws when read outside the provider', () => {
        expect(() => renderHook(() => useApiClient())).toThrow(
            'useApiClient must be used within an ApiClientProvider',
        );
    });

    it('provides a client created for the base URL', () => {
        const apiClient = makeApiClient('https://api.test');
        createAuthApiClient.mockReturnValue(apiClient);

        const { result } = renderHook(() => useApiClient(), {
            wrapper: ({ children }) => (
                <ApiClientProvider baseURL="https://api.test">{children}</ApiClientProvider>
            ),
        });

        expect(createAuthApiClient).toHaveBeenCalledWith('https://api.test');
        expect(result.current).toBe(apiClient);
    });

    it('recreates the client only when the base URL changes', () => {
        createAuthApiClient.mockImplementation(makeApiClient);
        let baseURL = 'https://api.test';
        const { rerender } = renderHook(() => useApiClient(), {
            wrapper: ({ children }) => (
                <ApiClientProvider baseURL={baseURL}>{children}</ApiClientProvider>
            ),
        });

        rerender();
        expect(createAuthApiClient).toHaveBeenCalledTimes(1);

        baseURL = 'https://other-api.test';
        rerender();
        expect(createAuthApiClient).toHaveBeenCalledTimes(2);
        expect(createAuthApiClient).toHaveBeenLastCalledWith('https://other-api.test');
    });
});

describe('PetsConfigContext', () => {
    it('throws when read outside the provider', () => {
        expect(() => renderHook(() => usePetsConfig())).toThrow(
            'usePetsConfig must be used within a PetsConfigProvider',
        );
    });

    it('defaults to no EVM config', () => {
        const { result } = renderHook(() => usePetsConfig(), {
            wrapper: ({ children }) => <PetsConfigProvider>{children}</PetsConfigProvider>,
        });

        expect(result.current).toEqual({ evm: null });
    });

    it('provides the configured EVM contract settings', () => {
        const evm: PetsEvmConfig = {
            contractAddress: '0x1234567890123456789012345678901234567890',
            abi: [] as unknown as Abi,
            enabled: true,
        };

        const { result } = renderHook(() => usePetsConfig(), {
            wrapper: ({ children }) => (
                <PetsConfigProvider evm={evm}>{children}</PetsConfigProvider>
            ),
        });

        expect(result.current.evm).toBe(evm);
    });
});

describe('SolanaAnchorContext', () => {
    const connection = { rpcEndpoint: 'http://localhost:8899' } as Connection;
    const programId = Keypair.generate().publicKey;
    const signingWallet: SolanaSigningWallet = {
        publicKey: Keypair.generate().publicKey,
        signTransaction: vi.fn(async <T extends Transaction | VersionedTransaction>(tx: T) => tx),
        signAllTransactions: vi.fn(async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs),
    };

    it('throws when read outside the provider', () => {
        expect(() => renderHook(() => useSolanaAnchor())).toThrow(
            'useSolanaAnchor must be used within SolanaAnchorProvider',
        );
    });

    it('provides the connection, program id, and signing wallet', () => {
        const { result } = renderHook(() => useSolanaAnchor(), {
            wrapper: ({ children }) => (
                <SolanaAnchorProvider
                    connection={connection}
                    programId={programId}
                    signingWallet={signingWallet}
                >
                    {children}
                </SolanaAnchorProvider>
            ),
        });

        expect(result.current).toEqual({
            connection,
            programId,
            signingWallet,
        });
    });
});
