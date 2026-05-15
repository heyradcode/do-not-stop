import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { http } from 'viem';
import { createConfig, WagmiProvider } from 'wagmi';
import { injected } from 'wagmi/connectors';

import { ApiClientProvider, AuthProvider, queryClient } from '@shared/core';
import { API_URL } from './config';
import { CHAINS } from './constants/chains';
import { SolanaWalletProvider } from './contexts';
import { DynamicProvider } from './contexts/dynamic';
import { WalletAwareRoutes } from './router';
import { SolanaWalletAdapterBridge } from './solana/SolanaWalletAdapterBridge';
import SolanaAuthSignerRegistration from './solana/SolanaAuthSignerRegistration';
import './App.css';

const allChains = CHAINS.map((chainConfig) => chainConfig.chain);

const config = createConfig({
    chains: allChains as any,
    connectors: [injected()],
    multiInjectedProviderDiscovery: false,
    transports: Object.fromEntries(allChains.map((chain) => [chain.id, http(chain.rpcUrls.default.http[0])])),
});

const App: React.FC = () => {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <DynamicProvider>
                    <SolanaWalletProvider network="Solana Local">
                        <SolanaAuthSignerRegistration />
                        <SolanaWalletAdapterBridge>
                            <ApiClientProvider baseURL={API_URL}>
                                <AuthProvider>
                                    <BrowserRouter>
                                        <WalletAwareRoutes />
                                    </BrowserRouter>
                                </AuthProvider>
                            </ApiClientProvider>
                        </SolanaWalletAdapterBridge>
                    </SolanaWalletProvider>
                </DynamicProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
};

export default App;
