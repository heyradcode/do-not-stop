export type SolanaAuthSigner = {
    getAddress: () => string;
    signMessage: (message: Uint8Array) => Promise<Uint8Array>;
};

let signer: SolanaAuthSigner | null = null;
const listeners = new Set<() => void>();

function emit() {
    for (const l of listeners) {
        l();
    }
}

/** Called from the app shell (e.g. under `WalletProvider` + Dynamic) to expose Solana signing for {@link AuthProvider}. */
export function setSolanaAuthSigner(next: SolanaAuthSigner | null): void {
    signer = next;
    emit();
}

export function getSolanaAuthSigner(): SolanaAuthSigner | null {
    return signer;
}

export function subscribeSolanaAuth(onStoreChange: () => void): () => void {
    listeners.add(onStoreChange);
    return () => {
        listeners.delete(onStoreChange);
    };
}

export function getSolanaAuthAddress(): string | null {
    return signer?.getAddress() ?? null;
}
