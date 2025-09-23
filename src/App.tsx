import React from 'react';
import {
  createConfig,
  WagmiProvider,
} from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http } from 'viem';
import { 
  // Mainnets
  mainnet,
  bsc,
  polygon,
  arbitrum,
  optimism,
  avalanche,
  base,
  fantom,
  celo,
  gnosis,
  // Testnets
  sepolia,
  bscTestnet,
  polygonMumbai,
  arbitrumSepolia,
  optimismSepolia,
  avalancheFuji,
  baseSepolia,
  fantomTestnet,
  celoAlfajores,
  gnosisChiado
} from 'viem/chains';
import { injected } from 'wagmi/connectors';
import { AuthProvider } from './contexts/AuthContext';
import Main from './components/Main';
import './App.css';

// All supported chains
const mainnetChains = [mainnet, bsc, polygon, arbitrum, optimism, avalanche, base, fantom, celo, gnosis];
const testnetChains = [sepolia, bscTestnet, polygonMumbai, arbitrumSepolia, optimismSepolia, avalancheFuji, baseSepolia, fantomTestnet, celoAlfajores, gnosisChiado];
const allChains = [...mainnetChains, ...testnetChains];

const config = createConfig({
  chains: allChains,
  connectors: [injected()],
  multiInjectedProviderDiscovery: false,
  transports: Object.fromEntries(
    allChains.map(chain => [chain.id, http()])
  ),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: (failureCount, error: any) => {
        // Don't retry on 401 (unauthorized)
        if (error?.response?.status === 401) {
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
        <AuthProvider>
          <Main />
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default App;

