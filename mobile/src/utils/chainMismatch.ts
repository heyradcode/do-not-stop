/**
 * The wallet refusing a request whose chain is not the one it currently has open.
 *
 * MetaMask answers `eth_sendTransaction` with JSON-RPC -32602 and "active chainId is
 * different than the one provided" when the request names a chain it is not on. Every
 * write here pins `chainId` from `useEvmPetsConfig`, which follows `useAccount().chainId`,
 * so this can only mean wagmi's idea of the active chain has drifted from the wallet's
 * real one. `useEvmChainSync` repairs that drift; this is what the player sees in the
 * window before it does, or when a network is changed mid-signature.
 *
 * Matched on the message as well as the code: the code arrives as `-32602` from the
 * connector but is often re-wrapped by viem into an error whose `code` is gone.
 */
const RPC_INVALID_PARAMS = -32602;

export const isChainMismatchError = (error: unknown): boolean => {
    if (!error) return false;
    const code = (error as { code?: number }).code;
    // Read `message` off any shape that carries one. The refusal often arrives as a plain
    // JSON-RPC object rather than an Error, and `String(obj)` is "[object Object]".
    const raw = (error as { message?: unknown }).message;
    const message = typeof raw === 'string' ? raw : String(error);
    const saysChainMismatch = /active chain\s*id is different|chain(Id)? (mismatch|does not match)/i.test(
        message,
    );
    return saysChainMismatch || (code === RPC_INVALID_PARAMS && /chain/i.test(message));
};

export const CHAIN_MISMATCH_MESSAGE =
    'Your wallet is on a different network than the game. Open it, switch back, and try again.';
