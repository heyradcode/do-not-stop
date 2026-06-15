import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const auth = { isAuthenticated: false };
const dynamic: { user: unknown; primaryWallet: unknown } = { user: null, primaryWallet: null };

vi.mock('@shared/core', () => ({ useAuth: () => auth }));
vi.mock('@contexts/dynamic', () => ({ useDynamicContext: () => dynamic }));

import { useIsLoggedIn } from '@hooks/useIsLoggedIn';

describe('useIsLoggedIn', () => {
    beforeEach(() => {
        auth.isAuthenticated = false;
        dynamic.user = null;
        dynamic.primaryWallet = null;
    });

    it('is false with no session, user or wallet', () => {
        const { result } = renderHook(() => useIsLoggedIn());
        expect(result.current).toBe(false);
    });

    it('is true when a JWT session is authenticated', () => {
        auth.isAuthenticated = true;
        const { result } = renderHook(() => useIsLoggedIn());
        expect(result.current).toBe(true);
    });

    it('is true when a Dynamic user is present', () => {
        dynamic.user = { id: 'u1' };
        const { result } = renderHook(() => useIsLoggedIn());
        expect(result.current).toBe(true);
    });

    it('is true when only a wallet is connected', () => {
        dynamic.primaryWallet = { address: '0xabc' };
        const { result } = renderHook(() => useIsLoggedIn());
        expect(result.current).toBe(true);
    });
});
