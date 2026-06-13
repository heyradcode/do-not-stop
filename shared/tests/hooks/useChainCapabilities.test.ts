import { beforeEach, describe, expect, it, vi } from 'vitest';

const activeChain: { kind: 'evm' | 'solana' | 'none'; address: string | null } = {
    kind: 'none',
    address: null,
};
vi.mock('../../src/hooks/useActiveChain', () => ({ useActiveChain: () => activeChain }));
vi.mock('../../src/hooks/adapters/useEvmAdapter', () => ({
    EVM_CAPABILITIES: { chainLabel: 'Ethereum', tag: 'evm-caps' },
}));
vi.mock('../../src/hooks/adapters/useSolanaAdapter', () => ({
    SOLANA_CAPABILITIES: { chainLabel: 'Solana', tag: 'sol-caps' },
}));

import { useChainCapabilities } from '../../src/hooks/useChainCapabilities';

beforeEach(() => {
    activeChain.kind = 'none';
    activeChain.address = null;
});

// useActiveChain is mocked to a plain object, so the hook is a pure function here.
describe('useChainCapabilities', () => {
    it('reports a disconnected context with null capabilities', () => {
        const ctx = useChainCapabilities();
        expect(ctx.kind).toBe('none');
        expect(ctx.activeKind).toBeNull();
        expect(ctx.isConnected).toBe(false);
        expect(ctx.walletAddress).toBeNull();
        expect(ctx.chainLabel).toBe('');
    });

    it('uses EVM capabilities and wallet context when on evm', () => {
        activeChain.kind = 'evm';
        activeChain.address = '0xabc';

        const ctx = useChainCapabilities();
        expect(ctx).toMatchObject({
            kind: 'evm',
            activeKind: 'evm',
            isConnected: true,
            walletAddress: '0xabc',
            chainLabel: 'Ethereum',
        });
    });

    it('uses Solana capabilities when on solana', () => {
        activeChain.kind = 'solana';
        activeChain.address = 'SoLaddr';

        const ctx = useChainCapabilities();
        expect(ctx).toMatchObject({
            kind: 'solana',
            activeKind: 'solana',
            isConnected: true,
            walletAddress: 'SoLaddr',
            chainLabel: 'Solana',
        });
    });
});
