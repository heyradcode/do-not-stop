/**
 * Turns a failed sign-in into something a player can act on.
 *
 * The case worth separating is the WalletConnect relay refusing to publish. The request
 * never reaches the wallet, so no prompt ever appears, and viem reports it as
 * `UnknownRpcError: An unknown RPC error occurred` with "Failed to publish payload" buried
 * in the detail. Told that, a player waits for a prompt that is not coming; told the
 * connection dropped, they reconnect and it works.
 *
 * It is a transport failure, not a refusal, and the difference is the whole advice: one is
 * fixed by retrying or reconnecting, the other by approving the prompt.
 */
const RELAY_PATTERNS = [
    /failed to publish payload/i,
    /request expired/i,
    /websocket connection failed/i,
    /no matching key/i,
    /session topic doesn't exist/i,
];

export type SignInFailure = {
    message: string;
    /** The wallet never saw the request, so reconnecting is what helps. */
    isUnreachable: boolean;
};

export const describeSignInFailure = (error: unknown): SignInFailure | null => {
    if (!error) return null;

    const raw = (error as { message?: unknown }).message;
    const message = typeof raw === 'string' ? raw : String(error);

    if (RELAY_PATTERNS.some((pattern) => pattern.test(message))) {
        return {
            message:
                'Could not reach your wallet, so it never showed you the request. Check your connection and sign in again; if it keeps failing, disconnect and reconnect.',
            isUnreachable: true,
        };
    }

    if (/user rejected|user denied|user cancell?ed/i.test(message)) {
        return { message: 'Sign-in cancelled in your wallet.', isUnreachable: false };
    }

    return {
        message: 'Could not sign you in. Try again.',
        isUnreachable: false,
    };
};
