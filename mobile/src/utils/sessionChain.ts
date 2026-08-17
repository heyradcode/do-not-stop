/**
 * Chain the WalletConnect session must send requests on, or `null` when the
 * current one already works.
 *
 * The sign client validates every `request()` against the session namespaces and
 * throws `Missing or invalid. request() chainId: eip155:<id>` locally when the
 * chain was never approved — the wallet never sees the request. AppKit pins the
 * provider to `defaultNetwork` regardless of what the wallet approved, so a
 * session that approved only, say, mainnet leaves the provider on Sepolia and
 * every `personal_sign` dies before it leaves the app.
 *
 * That failure is not limited to signing: `wallet_addEthereumChain`, the one call
 * that can extend a live session to cover the target, goes out on the same pinned
 * chain and dies the same way. Moving to an approved chain is what makes signing,
 * switching, and adding the target possible at all.
 */
export function pickRequestChainId(input: {
    /** Approved ids, or `null` when unknown (no session / non-WalletConnect). */
    approved: number[] | null;
    /** Chain the provider is currently pinned to. */
    current: number | undefined;
    target: number;
    /** Ids wagmi is configured for; it cannot switch to anything else. */
    configured: number[];
}): number | null {
    const { approved, current, target, configured } = input;

    // Unknown approvals cannot rule anything out, and an approved target needs no
    // repair — the ordinary wrong-network switch handles the rest.
    if (!approved || approved.includes(target)) return null;
    if (current !== undefined && approved.includes(current)) return null;

    return configured.find((id) => approved.includes(id)) ?? null;
}
