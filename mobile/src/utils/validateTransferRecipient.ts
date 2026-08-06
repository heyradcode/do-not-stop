/**
 * Checks a transfer recipient before a signature is ever requested.
 *
 * Chain-blind: `isValid` comes from `useChainCapabilities().address`, which is hex
 * on EVM and base58 on Solana, so this never needs to know which chain it is on.
 *
 * The self-send rule is the one worth having. An ERC-721 transfer to your own
 * address succeeds, costs gas, and does nothing, so the chain will not stop you
 * and there is nothing to undo afterwards.
 */
export interface TransferRecipientInput {
    raw: string;
    isValid: (value: string) => boolean;
    /** Chain name for the copy, e.g. "Ethereum" or "Solana". */
    chainLabel: string;
    /** The sender, to reject a transfer to self. */
    walletAddress: string | null;
}

export function validateTransferRecipient({
    raw,
    isValid,
    chainLabel,
    walletAddress,
}: TransferRecipientInput): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return 'Please enter a recipient address';
    if (!isValid(trimmed)) return `Please enter a valid ${chainLabel} address`;
    // Compared case-insensitively because EVM addresses are routinely written in
    // both checksummed and lowercase form, and they are the same account.
    if (trimmed.toLowerCase() === (walletAddress ?? '').toLowerCase()) {
        return 'You cannot send a pet to yourself';
    }
    return null;
}
