import {
    createContext,
    useContext,
    useState,
    useEffect,
    useSyncExternalStore,
    type ReactNode,
} from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useNonce } from '../hooks/chains/ethereum';
import { useVerifySignature } from '../hooks/chains/ethereum';
import { getStorageAdapter } from '../api';
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
    user: User | null;
    logout: () => Promise<void> | void;
    signAndLogin: () => Promise<void> | void;
    isSigning: boolean;
    isVerifying: boolean;
    isNonceLoading: boolean;
}

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
    const [user, setUser] = useState<User | null>(null);
    const [pendingNonce, setPendingNonce] = useState<string | null>(null);
    const [isSolanaSigning, setSolanaSigning] = useState(false);

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
