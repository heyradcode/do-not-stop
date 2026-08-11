// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const get = vi.fn();
const apiClient = { get, defaults: { baseURL: 'https://api.test' } };
const auth = { isAuthenticated: true };
const activeChain = { kind: 'evm' as string, address: '0xabc' };
const config = { data: { deploymentId: 'base-sepolia-live', chainIds: ['eip155:84532'], ruleset: { hash: '0xaa' } } };

vi.mock('../../src/contexts/ApiClientContext', () => ({ useApiClient: () => apiClient }));
vi.mock('../../src/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../src/hooks/session/useActiveChain', () => ({ useActiveChain: () => activeChain }));
vi.mock('../../src/hooks/battle/useBattleConfig', () => ({ useBattleConfig: () => config }));

import { useDefenseAuthorizations } from '../../src/hooks/battle/useDefenseAuthorizations';

const SERVED = `0x${'11'.repeat(32)}`;
const OLD = `0x${'22'.repeat(32)}`;

const grant = (isStale: boolean, rulesetHash = isStale ? OLD : SERVED) => ({
    authorizationHash: `0x${'ab'.repeat(32)}`,
    allPets: true,
    petIds: [],
    minLevel: 1,
    maxLevel: 100,
    maxBattlesPerDay: 50,
    notBefore: 1000,
    expiresAt: 2000,
    rulesetHash,
    isStale,
    createdAt: '2026-08-01T00:00:00.000Z',
});

const wrapper = ({ children }: { children: React.ReactNode }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
    vi.clearAllMocks();
    activeChain.kind = 'evm';
    auth.isAuthenticated = true;
});

/**
 * The read that tells a defender whether their consent still applies (§D).
 *
 * What the status collapses to is the whole product decision here: a defender sees one
 * sentence, and which sentence decides whether they act.
 */
describe('useDefenseAuthorizations', () => {
    it('reports no consent when nothing was ever granted', async () => {
        get.mockResolvedValue({ data: { rulesetHash: SERVED, authorizations: [] } });
        const { result } = renderHook(() => useDefenseAuthorizations(), { wrapper });

        await waitFor(() => expect(result.current.status.kind).toBe('none'));
    });

    it('reports active consent when a grant matches the served rules', async () => {
        get.mockResolvedValue({ data: { rulesetHash: SERVED, authorizations: [grant(false)] } });
        const { result } = renderHook(() => useDefenseAuthorizations(), { wrapper });

        await waitFor(() => expect(result.current.status.kind).toBe('active'));
    });

    // The state the whole read exists for, and it must not collapse into `none`. "You never
    // allowed challenges" and "the rules changed, allow them again" ask the same action but
    // are not the same message, and the first reads as the app having forgotten.
    it('reports stale consent, distinctly from having none', async () => {
        get.mockResolvedValue({ data: { rulesetHash: SERVED, authorizations: [grant(true)] } });
        const { result } = renderHook(() => useDefenseAuthorizations(), { wrapper });

        await waitFor(() => expect(result.current.status.kind).toBe('stale'));
    });

    // A defender holding one usable grant and three superseded ones is covered, and telling
    // them to re-sign would be wrong.
    it('prefers active over stale when both are present', async () => {
        get.mockResolvedValue({
            data: { rulesetHash: SERVED, authorizations: [grant(true), grant(false), grant(true)] },
        });
        const { result } = renderHook(() => useDefenseAuthorizations(), { wrapper });

        await waitFor(() => expect(result.current.status.kind).toBe('active'));
        if (result.current.status.kind === 'active') {
            // Only the usable ones, so a caller listing them does not show grants that cover
            // nothing as though they still did.
            expect(result.current.status.authorizations).toHaveLength(1);
        }
    });

    it('asks for the served chain id rather than the adapter discriminator', async () => {
        get.mockResolvedValue({ data: { rulesetHash: SERVED, authorizations: [] } });
        renderHook(() => useDefenseAuthorizations(), { wrapper });

        await waitFor(() => expect(get).toHaveBeenCalled());
        expect(get).toHaveBeenCalledWith('/api/battle/authorizations', {
            params: { chainId: 'eip155:84532' },
        });
    });

    it('stays unknown rather than claiming no consent while it cannot ask', async () => {
        // Disconnected is not the same as unconsented, and rendering "nobody can battle your
        // pets" at someone who simply has no wallet connected would be a false statement
        // about their account.
        activeChain.kind = 'none';
        const { result } = renderHook(() => useDefenseAuthorizations(), { wrapper });

        expect(result.current.status.kind).toBe('unknown');
        expect(get).not.toHaveBeenCalled();
    });
});
