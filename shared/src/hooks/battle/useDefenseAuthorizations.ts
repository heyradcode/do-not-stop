import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import { useAuth } from '../../contexts/AuthContext';
import { useActiveChain } from '../session/useActiveChain';
import { tryChainIdFor } from './chainIdFor';
import { useBattleConfig } from './useBattleConfig';

/**
 * Reading the standing consent this wallet has granted (§D).
 *
 * The half of the consent API that did not exist until now. Granting and revoking were
 * both possible and neither could be observed, so a defender could not answer "have I
 * allowed challenges?" and, far worse, could not answer "does that still apply?"
 *
 * The second question is the one this is for. Consent is bound to `rulesetHash`, so a rules
 * change invalidates every outstanding grant on purpose. Being challenged is *passive*
 * though: a defender never finds out by trying something and failing, their pets simply
 * stop being challengeable. The only person who sees an error is the attacker, who cannot
 * fix it. Without this read the person who must re-sign is the only one not told.
 */

export interface DefenseAuthorizationSummary {
    authorizationHash: string;
    allPets: boolean;
    petIds: string[];
    minLevel: number;
    maxLevel: number;
    maxBattlesPerDay: number;
    /** Unix seconds. */
    notBefore: number;
    expiresAt: number;
    rulesetHash: string;
    /** Signed under a different ruleset, so it covers no battle until re-signed. */
    isStale: boolean;
    createdAt: string;
}

interface AuthorizationsResponse {
    rulesetHash: string;
    authorizations: DefenseAuthorizationSummary[];
}

export type ConsentStatus =
    /** Still loading, or no wallet/chain to ask about. */
    | { kind: 'unknown' }
    /** No live grant. Pets cannot be challenged at all. */
    | { kind: 'none' }
    /** At least one grant covering battles under the rules being served now. */
    | { kind: 'active'; authorizations: DefenseAuthorizationSummary[] }
    /**
     * Grants exist but every one was signed under older rules.
     *
     * Its own state rather than folded into `none`, and the distinction is the whole point:
     * "you never allowed challenges" and "the rules changed, please allow them again" ask
     * the same action of the player but are not the same message, and showing the first
     * when the second is true reads as the app having forgotten.
     */
    | { kind: 'stale'; authorizations: DefenseAuthorizationSummary[] };

export function defenseAuthorizationsQueryKey(baseURL: string, chainId: string | null): unknown[] {
    return ['defenseAuthorizations', baseURL, chainId];
}

export interface UseDefenseAuthorizationsResult {
    status: ConsentStatus;
    isLoading: boolean;
    error: Error | null;
    /** Drops the cached read, for a caller that just granted or revoked. */
    refresh(): void;
}

export const useDefenseAuthorizations = (): UseDefenseAuthorizationsResult => {
    const apiClient = useApiClient();
    const activeChain = useActiveChain();
    const { isAuthenticated } = useAuth();
    const { data: config } = useBattleConfig();
    const queryClient = useQueryClient();
    const baseURL = apiClient.defaults.baseURL ?? '';

    // Null until the config names the chains this deployment serves, since the id is the
    // protocol's (`eip155:84532`), not the adapter's discriminator.
    const chainId =
        activeChain.kind === 'none' || !config ? null : tryChainIdFor(activeChain.kind, config.chainIds);

    const query = useQuery({
        queryKey: defenseAuthorizationsQueryKey(baseURL, chainId),
        enabled: chainId != null && isAuthenticated,
        queryFn: async () => {
            const { data } = await apiClient.get<AuthorizationsResponse>('/api/battle/authorizations', {
                params: { chainId },
            });
            return data;
        },
    });

    return {
        status: toStatus(query.data, query.isLoading || chainId == null || !isAuthenticated),
        isLoading: query.isLoading,
        error: query.error as Error | null,
        refresh: () => {
            void queryClient.invalidateQueries({ queryKey: defenseAuthorizationsQueryKey(baseURL, chainId) });
        },
    };
};

/**
 * Collapses the list into the one thing a screen has to say.
 *
 * `active` wins over `stale` whenever any grant is current, because a defender holding one
 * usable authorization and three superseded ones is covered, and telling them to re-sign
 * would be wrong. Only when *nothing* is current does the stale set become the story.
 */
function toStatus(data: AuthorizationsResponse | undefined, pending: boolean): ConsentStatus {
    if (pending || !data) {
        return { kind: 'unknown' };
    }
    if (data.authorizations.length === 0) {
        return { kind: 'none' };
    }
    const current = data.authorizations.filter((entry) => !entry.isStale);
    return current.length > 0
        ? { kind: 'active', authorizations: current }
        : { kind: 'stale', authorizations: data.authorizations };
}
