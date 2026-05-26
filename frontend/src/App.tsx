import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { WagmiProvider } from 'wagmi';

import { ApiClientProvider, AuthProvider, PetsConfigProvider, queryClient } from '@shared/core';
import { wagmiConfig } from '@chains/ethereum/wagmi';
import { SolanaAnchorWallet } from '@chains/solana/anchor-wallet';
import { SolanaAuthSigner } from '@chains/solana/auth-signer';
import { SolanaWalletProvider } from '@chains/solana/provider';
import { API_URL } from '@/config';
import { solanaNetworkNameFromCluster } from '@constants/chains';
import { DynamicProvider } from '@contexts/dynamic';
import { petsContractParams } from '@/petsContractParams';
import { WalletAwareRoutes } from '@router';
import './App.css';

const solanaNetwork = solanaNetworkNameFromCluster(import.meta.env.VITE_SOLANA_CLUSTER);

const App: React.FC = () => {
    return (
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                <DynamicProvider>
                    <SolanaWalletProvider network={solanaNetwork}>
                        <SolanaAuthSigner />
                        <SolanaAnchorWallet>
                            <ApiClientProvider baseURL={API_URL}>
                                <AuthProvider>
                                    <PetsConfigProvider evm={petsContractParams}>
                                        <BrowserRouter>
                                            <WalletAwareRoutes />
                                        </BrowserRouter>
                                    </PetsConfigProvider>
                                </AuthProvider>
                            </ApiClientProvider>
                        </SolanaAnchorWallet>
                    </SolanaWalletProvider>
                </DynamicProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
};

export default App;
