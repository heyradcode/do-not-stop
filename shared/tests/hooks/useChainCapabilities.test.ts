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

// Mutable fee stubs — tests override these per-case.
const evmFees: { levelUpFee?: bigint } = {};
const solanaFees: { levelUpFeeLamports?: bigint } = {};
vi.mock('../../src/hooks/chains/ethereum/useEvmFees', () => ({ useEvmFees: () => evmFees }));
vi.mock('../../src/hooks/chains/solana/useSolanaFees', () => ({ useSolanaFees: () => solanaFees }));

import { useChainCapabilities } from '../../src/hooks/useChainCapabilities';

beforeEach(() => {
    activeChain.kind = 'none';
    activeChain.address = null;
    evmFees.levelUpFee = undefined;
    solanaFees.levelUpFeeLamports = undefined;
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

    it('overrides levelUpFee with live ETH value on EVM', () => {
        activeChain.kind = 'evm';
        evmFees.levelUpFee = 4_000_000_000_000_000n; // 0.004 ETH

        const ctx = useChainCapabilities();
        expect(ctx.levelUpFee).toEqual({ amount: '0.004', symbol: 'ETH' });
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

    it('overrides levelUpFee with live SOL value on Solana', () => {
        activeChain.kind = 'solana';
        solanaFees.levelUpFeeLamports = 4_000_000n; // 0.004 SOL

        const ctx = useChainCapabilities();
        expect(ctx.levelUpFee).toEqual({ amount: '0.004', symbol: 'SOL' });
    });

    it('leaves levelUpFee as the static default when fees have not loaded', () => {
        activeChain.kind = 'solana';
        // solanaFees.levelUpFeeLamports stays undefined

        const ctx = useChainCapabilities();
        // SOLANA_CAPABILITIES stub has no levelUpFee field → falls back to undefined/null
        expect(ctx.levelUpFee).toBeUndefined();
    });
});
