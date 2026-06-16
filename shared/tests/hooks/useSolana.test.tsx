// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../src/contexts/SolanaAnchorContext', () => ({
    useSolanaAnchor: () => ({ signingWallet: null }),
}));
vi.mock('../../src/hooks/chains/solana/useProgram', () => ({
    useProgram: () => ({ program: null, programId: null, isReady: false }),
}));
vi.mock('../../src/hooks/chains/solana/useGlobalState', () => ({
    useGlobalState: () => ({ data: null, status: 'pending' }),
}));
vi.mock('../../src/hooks/chains/solana/usePlayerProfile', () => ({
    usePlayerProfile: () => ({ data: null, status: 'pending' }),
}));
vi.mock('../../src/hooks/chains/solana/usePets', () => ({
    usePets: () => ({ data: [], status: 'pending' }),
}));
vi.mock('../../src/hooks/chains/solana/usePetActions', () => ({
    usePetActions: () => ({ createPet: { mutateAsync: vi.fn() } }),
}));

import { useSolana } from '../../src/hooks/chains/solana/useSolana';

describe('useSolana', () => {
    it('spreads program and actions into the returned object', () => {
        const { result } = renderHook(() => useSolana());
        expect(result.current).toHaveProperty('program');
        expect(result.current).toHaveProperty('isReady');
        expect(result.current).toHaveProperty('globalState');
        expect(result.current).toHaveProperty('playerProfile');
        expect(result.current).toHaveProperty('pets');
        expect(result.current).toHaveProperty('createPet');
    });
});
