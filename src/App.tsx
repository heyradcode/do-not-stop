import React from 'react';
import {
  createConfig,
  WagmiProvider,
} from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http } from 'viem';
import { mainnet } from 'viem/chains';
import { injected } from 'wagmi/connectors';
import AccountInfo from './components/AccountInfo';
import './App.css';

const config = createConfig({
  chains: [mainnet],
  connectors: [injected()],
  multiInjectedProviderDiscovery: false,
  transports: {
    [mainnet.id]: http(),
  },
});

const queryClient = new QueryClient();

const App: React.FC = () => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AccountInfo />
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default App;

