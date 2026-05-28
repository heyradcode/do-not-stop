function readErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
        return String((error as { message: unknown }).message);
    }
    return String(error);
}

/** Maps Solana / Anchor / wallet errors to user-facing breed/action messages. */
export function formatSolanaActionError(error: unknown, fallback = 'Transaction failed. Please try again.'): string {
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

    if (lower.includes('already in use') || lower.includes('breedrequestalreadypending')) {
        return 'A breed is already in progress for this wallet. Try again to finish it.';
    }

    if (lower.includes('petnotready') || lower.includes('pet is on cooldown')) {
        return 'One or both parents are still on cooldown. Wait until they are ready and try again.';
    }

    if (lower.includes('cannotbreedself')) {
        return 'You cannot breed a pet with itself.';
    }

    if (lower.includes('simulation failed') || lower.includes('custom program error')) {
        return `On-chain program rejected the transaction: ${message}`;
    }

    if (message.trim()) {
        return message;
    }

    return fallback;
}
