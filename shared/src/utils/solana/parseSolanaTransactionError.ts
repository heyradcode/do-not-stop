const readErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
        return String((error as { message: unknown }).message);
    }
    return String(error);
};

/** Maps Solana / Anchor / wallet errors to user-facing breed/action messages. */
export const formatSolanaActionError = (error: unknown, fallback = 'Transaction failed. Please try again.'): string => {
    const message = readErrorMessage(error);
    const lower = message.toLowerCase();

    if (
        lower.includes('user rejected') ||
        lower.includes('user denied') ||
        lower.includes('rejected the request') ||
        lower.includes('transaction cancelled')
    ) {
        return 'Transaction cancelled in your wallet.';
    }

    if (lower.includes('blockhash not found') || lower.includes('block height exceeded')) {
        return 'The transaction took too long to confirm. Please try again and approve it promptly in your wallet.';
    }

    if (lower.includes('insufficient funds') || lower.includes('insufficient lamports')) {
        return 'Not enough SOL in your wallet to pay for this transaction.';
    }

    if (lower.includes('switchboard oracle did not produce a reveal instruction')) {
        return 'Switchboard randomness is still processing. Wait a few seconds and try again.';
    }

    // The dead end, and the only one waiting does not fix: the oracle's seed slot is gone,
    // so this request can never settle. The pending-request banners offer the cancel that
    // clears it, which is why this says clear rather than retry.
    if (lower.includes('randomnessexpired') || lower.includes('randomness has expired')) {
        return 'This request sat too long and its randomness expired. Clear the pending request to start a new one.';
    }

    // Reveal and settle share a transaction, so the oracle answering late lands here rather
    // than on the expiry above. Retrying is the right advice.
    if (lower.includes('randomnessnotresolved') || lower.includes('not yet revealed')) {
        return 'Switchboard has not published this randomness yet. Wait a few seconds and try again.';
    }

    /**
     * Almost always a stale gallery rather than a real permission problem.
     *
     * Every pet action checks the signer against the Metaplex Core asset's *live* owner,
     * while `usePets` lists pets by `PetAccount.owner` — a denormalized index the program
     * documents as stale-able, because an mpl-core transfer moves the asset without
     * touching this program. So the pet is on screen, the wallet no longer holds it, and
     * "Not authorized" is technically right and useless.
     */
    if (lower.includes('unauthorized') || lower.includes('not authorized')) {
        return 'This wallet does not own that pet on chain. If it is still showing in your list, refresh — the list can lag a transfer made outside the game.';
    }

    if (lower.includes('breedrequestalreadypending')) {
        return 'A breed is already in progress for this wallet. Try again to finish it.';
    }

    if (lower.includes('already in use')) {
        return 'A request is already in progress for this wallet. Try again to finish it.';
    }

    if (lower.includes('petnotready') || lower.includes('pet is on cooldown')) {
        return 'One or both pets are still on cooldown. Wait until they are ready and try again.';
    }

    if (lower.includes('cannotbreedself')) {
        return 'You cannot breed a pet with itself.';
    }

    // Everything else, including a raw simulation failure or an unmapped custom program
    // error, reaches the caller's fallback. Anchor's own text names an instruction and an
    // error code, which tells a player nothing they can act on.
    return fallback;
};
