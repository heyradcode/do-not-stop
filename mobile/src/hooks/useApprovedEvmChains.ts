import { useProvider } from '@reown/appkit-react-native';

/**
 * EVM chain ids the wallet actually approved for this session.
 *
 * Distinct from the chain wagmi reports. AppKit pins the provider's default chain
 * to `defaultNetwork` after connecting, so `useAccount().chainId` can name a chain
 * the session never authorized. Requests on such a chain fail inside the sign
 * client with `Missing or invalid. request() chainId: ...` and never reach the
 * wallet, which surfaces at signature time rather than at connect time.
 */

/**
 * CAIP-2 chain ids for the `eip155` namespace, as numbers.
 *
 * Reads `accounts` as well as `chains` because CAIP-25 only requires the former;
 * a wallet may approve chains and omit the optional `chains` array.
 */
export function parseApprovedEvmChainIds(namespaces: unknown): number[] {
    const eip155 = (namespaces as Record<string, unknown> | undefined)?.eip155 as
        | { chains?: unknown; accounts?: unknown }
        | undefined;
    if (!eip155) return [];

    const fromChains = Array.isArray(eip155.chains) ? eip155.chains : [];
    const fromAccounts = Array.isArray(eip155.accounts) ? eip155.accounts : [];

    const ids = [...fromChains, ...fromAccounts]
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => Number(entry.split(':')[1]))
        .filter((id) => Number.isFinite(id) && id > 0);

    return [...new Set(ids)];
}

/**
 * Approved EVM chain ids, or `null` when the answer is unknown — no session yet,
 * or a connector that is not WalletConnect. `null` means "do not gate on this",
 * never "nothing approved".
 */
export function useApprovedEvmChains(): number[] | null {
    const { provider } = useProvider();
    const namespaces = (provider as { session?: { namespaces?: unknown } } | undefined)?.session
        ?.namespaces;
    if (!namespaces) return null;

    const ids = parseApprovedEvmChainIds(namespaces);
    return ids.length > 0 ? ids : null;
}
