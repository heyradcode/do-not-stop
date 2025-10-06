import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { SOLANA_NETWORKS } from '../../constants/chains';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

interface SolanaWalletContextType {
    // This context is provided by the wallet adapter
}

const SolanaWalletContext = createContext<SolanaWalletContextType | undefined>(undefined);

export const useSolanaWallet = () => {
    const context = useContext(SolanaWalletContext);
    if (context === undefined) {
        throw new Error('useSolanaWallet must be used within a SolanaWalletProvider');
    }
    return context;
};

interface SolanaWalletProviderProps {
    children: ReactNode;
    network?: string;
}

export const SolanaWalletProvider: React.FC<SolanaWalletProviderProps> = ({
    children,
    network = 'Solana Local'
}) => {
    // Get the network configuration
    const networkConfig = SOLANA_NETWORKS.find(n => n.name === network) || SOLANA_NETWORKS[0];

    // Configure wallets
    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter(),
        ],
        []
    );

    return (
        <ConnectionProvider endpoint={networkConfig.rpcUrl}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <SolanaWalletContext.Provider value={{}}>
                        {children}
                    </SolanaWalletContext.Provider>
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};
