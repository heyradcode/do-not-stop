import React from 'react';
import "@walletconnect/react-native-compat";
import { AppKitProvider } from '@reown/appkit-react-native';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, ApiClientProvider, AuthProvider } from '@shared/core';

import { appKit, wagmiConfig } from './src/AppKitConfig';
import AppRoot from './src/AppContent.tsx';
import { API_URL } from './config';
import { SolanaAppKitAnchorBridge } from './src/solana/SolanaAppKitAnchorBridge';

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AppKitProvider instance={appKit}>
          <SolanaAppKitAnchorBridge>
            <ApiClientProvider baseURL={API_URL}>
              <AuthProvider>
                <AppRoot />
              </AuthProvider>
            </ApiClientProvider>
          </SolanaAppKitAnchorBridge>
        </AppKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
