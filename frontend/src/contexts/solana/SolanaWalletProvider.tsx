import { useMemo, type ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { SOLANA_NETWORKS } from '../../constants/chains';

import '@solana/wallet-adapter-react-ui/styles.css';

interface SolanaWalletProviderProps {
    children: ReactNode;
    network?: string;
}

/** Composes `@solana/wallet-adapter-react` providers (connection + supported wallets + modal). */
export const SolanaWalletProvider: React.FC<SolanaWalletProviderProps> = ({
    children,
    network = 'Solana Local',
}) => {
    const networkConfig = SOLANA_NETWORKS.find((n) => n.name === network) || SOLANA_NETWORKS[0];

    const wallets = useMemo(
        () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
        []
    );

    return (
        <ConnectionProvider endpoint={networkConfig.rpcUrl}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};
