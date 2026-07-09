import {
    createContext,
    useContext,
    useState,
    useEffect,
    useSyncExternalStore,
    type ReactNode,
} from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useNonce, useVerifySignature } from '../hooks/chains/ethereum';
import { getStorageAdapter, setUnauthorizedCallback } from '../api';
import {
    getSolanaAuthSigner,
    subscribeSolanaAuth,
    getSolanaAuthAddress,
} from '../auth/solanaAuthStore';
import { normalizeSolanaSignatureToBase58 } from '../utils/solana/signatureAuthCodec';

interface User {
    address: string;
    createdAt: string;
    lastLogin: string;
}

interface AuthContextType {
    isAuthenticated: boolean;
    /** True during the initial check of a stored token — avoids a sign-in gate flash on refresh. */
    isRestoring: boolean;
    user: User | null;
    logout: () => Promise<void> | void;
    signAndLogin: () => Promise<void> | void;
    isSigning: boolean;
    isVerifying: boolean;
    isNonceLoading: boolean;
}

/** Decode a JWT and return true if it exists and hasn't expired. */
const isJwtValid = (token: string): boolean => {
    try {
        const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(b64)) as { exp?: number };
        return typeof payload.exp === 'number' && payload.exp > Date.now() / 1000;
    } catch {
        return false;
    }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const { address, isConnected, chainId } = useAccount();
    const [isAuthenticated, setAuthenticated] = useState(false);
    const [isRestoring, setRestoring] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [pendingNonce, setPendingNonce] = useState<string | null>(null);
    const [isSolanaSigning, setSolanaSigning] = useState(false);

    // Restore auth from a previously stored JWT on mount (no network call needed —
    // we just check the expiry; the token is re-validated by the backend on the
    // next protected API call).
    useEffect(() => {
        // getToken may be sync or async (e.g. mobile AsyncStorage) — await both so
        // an async adapter doesn't feed a Promise into isJwtValid (which would
        // always fail and silently log the user out on refresh).
        let cancelled = false;
        const adapter = getStorageAdapter();
        Promise.resolve(adapter ? adapter.getToken() : null)
            .then((token) => {
                if (cancelled) return;
                if (token && isJwtValid(token)) setAuthenticated(true);
            })
            .finally(() => {
                if (!cancelled) setRestoring(false);
            });
        return () => { cancelled = true; };
    }, []);

    // When any API response returns 401 (expired / revoked token), clear auth state.
    useEffect(() => {
        setUnauthorizedCallback(() => {
            setAuthenticated(false);
            setUser(null);
        });
    }, []);

    const solanaAuthAddress = useSyncExternalStore(
        subscribeSolanaAuth,
        getSolanaAuthAddress,
        () => null
    );

    const { refetch: getNonce, isLoading: isNonceLoading } = useNonce();
    const {
        mutate: verifySignature,
        mutateAsync: verifySignatureAsync,
        isPending: isVerifying,
        data: authData,
        error: verifyError,
    } = useVerifySignature();

    const {
        signMessage,
        isPending: isEvmSigning,
        data: signature,
        error: signError,
    } = useSignMessage();

    useEffect(() => {
        const evmConnected = isConnected && !!address;
        const solConnected = Boolean(solanaAuthAddress);

        if (!evmConnected && !solConnected) {
            setAuthenticated(false);
            setUser(null);
            const adapter = getStorageAdapter();
            if (adapter) {
                adapter.removeToken();
            }
        }
    }, [address, isConnected, solanaAuthAddress]);

    useEffect(() => {
        if (signature && pendingNonce && address && chainId) {
            verifySignature({
                address,
                signature,
                nonce: pendingNonce,
                chainId,
            });
        }
    }, [signature, pendingNonce, address, chainId, verifySignature]);

    useEffect(() => {
        if (authData?.success) {
            setAuthenticated(true);
            setUser(authData.user);
            setPendingNonce(null);
        }
    }, [authData]);

    useEffect(() => {
        if (verifyError) {
            setPendingNonce(null);
            console.error('Authentication failed:', verifyError);
        }
    }, [verifyError]);

    useEffect(() => {
        if (signError) {
            setPendingNonce(null);
            console.error('Signing failed:', signError);
        }
    }, [signError]);

    const logout = async () => {
        const adapter = getStorageAdapter();
        if (adapter) {
            await adapter.removeToken();
        }
        setAuthenticated(false);
        setUser(null);
    };

    const signAndLogin = async () => {
        const pullNonce = async (): Promise<string> => {
            const res = await getNonce();
            if (res.isError) {
                console.error('Error getting nonce:', res.error);
                throw res.error;
            }
            const body = res.data;
            if (!body?.nonce) {
                const err = new Error('Invalid nonce response from server');
                console.error('Error getting nonce:', res);
                throw err;
            }
            return body.nonce;
        };

        if (address) {
            try {
                const nonce = await pullNonce();

                setPendingNonce(nonce);

                const message = `Sign this message to authenticate: ${nonce}`;

                signMessage({ message });
            } catch (error) {
                console.error('Error getting nonce:', error);
            }
            return;
        }

        const solSigner = getSolanaAuthSigner();
        if (!solSigner) {
            return;
        }

        setSolanaSigning(true);
        try {
            const nonce = await pullNonce();
            const message = `Sign this message to authenticate: ${nonce}`;
            const bytes = new TextEncoder().encode(message);
            const sigBytes = await solSigner.signMessage(bytes);
            const signatureB58 = normalizeSolanaSignatureToBase58(sigBytes);

            await verifySignatureAsync({
                address: solSigner.getAddress(),
                signature: signatureB58,
                nonce,
                chainId: 0,
            });
        } catch (error) {
            console.error('Solana sign-in failed:', error);
        } finally {
            setSolanaSigning(false);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                isAuthenticated,
                isRestoring,
                user,
                logout,
                signAndLogin,
                isSigning: isEvmSigning || isSolanaSigning,
                isVerifying,
                isNonceLoading,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export type { AuthContextType, User };
