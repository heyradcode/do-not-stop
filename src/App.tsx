import React, { useEffect } from 'react';
import {
  createConfig,
  WagmiProvider,
  useAccount,
} from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http } from 'viem';
import { mainnet } from 'viem/chains';

const config = createConfig({
  chains: [mainnet],
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

interface AccountInfoProps {}

const AccountInfo: React.FC<AccountInfoProps> = () => {
  const { address, isConnected, chain, status } = useAccount();

  useEffect(() => {
    console.log("Account status:", { address, isConnected, chain, status });
  }, [address, isConnected, chain, status]);

  return (
    <div>
      <h1>Wallet Connection Status</h1>
      <p>Connected: {isConnected ? 'true' : 'false'}</p>
      <p>Address: {address || 'Not connected'}</p>
      <p>Network: {chain?.id || 'Unknown'}</p>
      <p>Status: {status}</p>
    </div>
  );
};

export default App;

