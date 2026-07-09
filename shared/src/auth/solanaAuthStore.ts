export type SolanaAuthSigner = {
    getAddress: () => string;
    signMessage: (message: Uint8Array) => Promise<Uint8Array>;
};

let signer: SolanaAuthSigner | null = null;
const listeners = new Set<() => void>();

const emit = () => {
    for (const l of listeners) {
        l();
    }
};

/** Called from the app shell (e.g. under `WalletProvider` + Dynamic) to expose Solana signing for {@link AuthProvider}. */
export const setSolanaAuthSigner = (next: SolanaAuthSigner | null): void => {
    signer = next;
    emit();
};

export const getSolanaAuthSigner = (): SolanaAuthSigner | null => {
    return signer;
};

export function subscribeSolanaAuth(onStoreChange: () => void): () => void {
    listeners.add(onStoreChange);
    return () => {
        listeners.delete(onStoreChange);
    };
}

export const getSolanaAuthAddress = (): string | null => {
    return signer?.getAddress() ?? null;
};
