import React from 'react';
import "@walletconnect/react-native-compat";
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { AppKit, AppKitProvider } from '@reown/appkit-react-native';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, ApiClientProvider, AuthProvider, PetsConfigProvider } from '@shared/core';

import { appKit, wagmiConfig } from './src/AppKitConfig';
import { API_URL } from './config';
import { petsContractParams } from './src/petsContractParams';
import { ToastProvider } from './src/components/ui/toast';
import { RootNavigator } from './src/navigation/RootNavigator';
import { neon } from './src/theme/neon';
import { SolanaAppKitAnchorBridge } from './src/solana/SolanaAppKitAnchorBridge';

/**
 * Provider order matches `frontend/src/AppProviders.tsx`, with `NavigationContainer`
 * where its `BrowserRouter` sits.
 *
 * `SafeAreaProvider` is outermost so `ToastProvider` can measure a real bottom
 * inset; it used to live inside the old `AppContent`, which put it below the toast
 * viewport. `AppKit` renders as a sibling of the navigator so its connect sheet is
 * reachable from the landing screen and the tab shell alike.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={neon.bgDeep} />
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <AppKitProvider instance={appKit}>
            <SolanaAppKitAnchorBridge>
              <ApiClientProvider baseURL={API_URL}>
                <AuthProvider>
                  <PetsConfigProvider evm={petsContractParams}>
                    <ToastProvider>
                      <NavigationContainer>
                        <RootNavigator />
                      </NavigationContainer>
                      <AppKit />
                    </ToastProvider>
                  </PetsConfigProvider>
                </AuthProvider>
              </ApiClientProvider>
            </SolanaAppKitAnchorBridge>
          </AppKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </SafeAreaProvider>
  );
}
