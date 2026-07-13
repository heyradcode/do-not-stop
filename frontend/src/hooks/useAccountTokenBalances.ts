import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { getPopularTokens, type TokenInfo } from '@constants/tokens';

const ERC20_BALANCE_OF_ABI = [
    {
        type: 'function',
        name: 'balanceOf',
        stateMutability: 'view',
        inputs: [{ name: 'owner', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
] as const;

export interface TokenBalanceEntry {
    token: TokenInfo;
    balance: bigint | undefined;
}

export interface UseAccountTokenBalances {
    popularTokens: TokenInfo[];
    tokenBalances: TokenBalanceEntry[];
    /** True once every popular token's balance has resolved (success or failure). */
    allFetched: boolean;
    /** How many popular tokens resolved with a non-zero balance. */
    withBalanceCount: number;
}

/**
 * ERC-20 balances for `chainId`'s popular tokens, fetched via a single typed
 * multicall (react-query cached). Pass `enabled` to defer the fetch until it's
 * actually needed (e.g. only while an account dropdown is open).
 */
export const useAccountTokenBalances = (
    chainId: number | undefined,
    address: `0x${string}` | undefined,
    enabled: boolean,
): UseAccountTokenBalances => {
    const popularTokens = useMemo(() => getPopularTokens(chainId), [chainId]);

    const tokenContracts = useMemo(
        () =>
            address
                ? popularTokens.map((token) => ({
                      address: token.address,
                      abi: ERC20_BALANCE_OF_ABI,
                      functionName: 'balanceOf' as const,
                      args: [address] as const,
                  }))
                : [],
        [address, popularTokens],
    );

    const { data: tokenResults, isLoading: isTokensLoading } = useReadContracts({
        contracts: tokenContracts,
        allowFailure: true,
        query: { enabled: enabled && Boolean(address) && popularTokens.length > 0 },
    });

    const tokenBalances = useMemo(
        () =>
            popularTokens.map((token, idx) => {
                const res = tokenResults?.[idx];
                const balance = res?.status === 'success' ? res.result : undefined;
                return { token, balance };
            }),
        [popularTokens, tokenResults],
    );

    const allFetched =
        !isTokensLoading && tokenResults != null && tokenResults.length === popularTokens.length;
    const withBalanceCount = tokenBalances.filter(
        (t) => typeof t.balance === 'bigint' && t.balance > 0n,
    ).length;

    return { popularTokens, tokenBalances, allFetched, withBalanceCount };
};
