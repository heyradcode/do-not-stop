import { beforeEach, describe, expect, it, vi } from 'vitest';

const activeChain: { kind: 'evm' | 'solana' | 'none' } = { kind: 'none' };
const evmAdapter = { kind: 'evm', marker: 'evm-adapter' };
const solanaAdapter = { kind: 'solana', marker: 'solana-adapter' };
const useEvmAdapter = vi.fn(() => evmAdapter);
const useSolanaAdapter = vi.fn(() => solanaAdapter);

vi.mock('../../src/hooks/session/useActiveChain', () => ({
    useActiveChain: () => activeChain,
}));
vi.mock('../../src/hooks/adapters/useEvmAdapter', () => ({
    useEvmAdapter: (...args: unknown[]) => useEvmAdapter(...args),
}));
vi.mock('../../src/hooks/adapters/useSolanaAdapter', () => ({
    useSolanaAdapter: (...args: unknown[]) => useSolanaAdapter(...args),
}));

import { useChainAdapter } from '../../src/hooks/adapters/useChainAdapter';
import { noneAdapter } from '../../src/hooks/adapters/noneAdapter';

beforeEach(() => {
    vi.clearAllMocks();
    activeChain.kind = 'none';
});

describe('useChainAdapter', () => {
    it('mounts both chain adapters but returns none when disconnected', () => {
        const adapter = useChainAdapter();

        expect(adapter).toBe(noneAdapter);
        expect(useEvmAdapter).toHaveBeenCalledWith({ enabled: false });
        expect(useSolanaAdapter).toHaveBeenCalledWith({ enabled: false });
    });

    it('returns the EVM adapter and enables only EVM when the active chain is EVM', () => {
        activeChain.kind = 'evm';

        const adapter = useChainAdapter();

        expect(adapter).toBe(evmAdapter);
        expect(useEvmAdapter).toHaveBeenCalledWith({ enabled: true });
        expect(useSolanaAdapter).toHaveBeenCalledWith({ enabled: false });
    });

    it('returns the Solana adapter and enables only Solana when the active chain is Solana', () => {
        activeChain.kind = 'solana';

        const adapter = useChainAdapter();

        expect(adapter).toBe(solanaAdapter);
        expect(useEvmAdapter).toHaveBeenCalledWith({ enabled: false });
        expect(useSolanaAdapter).toHaveBeenCalledWith({ enabled: true });
    });
});
