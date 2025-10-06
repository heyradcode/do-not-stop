import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import React from 'react';
import { http } from 'viem';
import {
  createConfig,
  WagmiProvider,
} from 'wagmi';
import { injected } from 'wagmi/connectors';

import Main from './components/layout/Main';
import { AuthProvider, SolanaWalletProvider } from './contexts';
import { CHAINS } from './constants/chains';
import './App.css';

// All supported chains from centralized configuration
const allChains = CHAINS.map(chainConfig => chainConfig.chain);

const config = createConfig({
  chains: allChains as any,
  connectors: [injected()],
  multiInjectedProviderDiscovery: false,
  transports: Object.fromEntries(
    allChains.map(chain => [
      chain.id,
      http(chain.rpcUrls.default.http[0])
    ])
  ),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: (failureCount, error) => {
        // Don't retry on 401 (unauthorized)
        if (error instanceof AxiosError && error.response?.status === 401) {
          return false;
        }
        return failureCount < 3;
      },
    },
    mutations: {
      retry: false, // Don't retry mutations by default
    },
  },
});

const App: React.FC = () => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <SolanaWalletProvider network="Solana Local">
          <AuthProvider>
            <Main />
          </AuthProvider>
        </SolanaWalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default App;

