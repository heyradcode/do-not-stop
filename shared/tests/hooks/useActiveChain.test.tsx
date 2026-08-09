// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const account: { address: `0x${string}` | undefined; isConnected: boolean } = {
    address: undefined,
    isConnected: false,
};
vi.mock('wagmi', () => ({ useAccount: () => account }));

// Stub the solana auth store so we can control the address without the real store.
let solanaAddress: string | null = null;
vi.mock('../../src/auth/solanaAuthStore', () => ({
    getSolanaAuthAddress: () => solanaAddress,
    subscribeSolanaAuth: (_cb: () => void) => {
        // Return a no-op unsubscribe; we drive updates manually via re-render.
        return () => undefined;
    },
}));

import { useActiveChain } from '../../src/hooks/session/useActiveChain';

beforeEach(() => {
    account.address = undefined;
    account.isConnected = false;
    solanaAddress = null;
});

describe('useActiveChain', () => {
    it('returns none when nothing is connected', () => {
        const { result } = renderHook(() => useActiveChain());
        expect(result.current.kind).toBe('none');
    });

    it('returns evm when wagmi account is connected', () => {
        account.address = '0xdeadbeef' as `0x${string}`;
        account.isConnected = true;
        const { result } = renderHook(() => useActiveChain());
        expect(result.current.kind).toBe('evm');
        if (result.current.kind === 'evm') {
            expect(result.current.address).toBe('0xdeadbeef');
        }
    });

    it('returns solana when only a Solana signer is present', () => {
        solanaAddress = 'SoLWalletAddr';
        const { result } = renderHook(() => useActiveChain());
        expect(result.current.kind).toBe('solana');
        if (result.current.kind === 'solana') {
            expect(result.current.address).toBe('SoLWalletAddr');
        }
    });

    it('EVM takes precedence when both are connected', () => {
        account.address = '0xevm' as `0x${string}`;
        account.isConnected = true;
        solanaAddress = 'SoLAddr';
        const { result } = renderHook(() => useActiveChain());
        expect(result.current.kind).toBe('evm');
    });
});
