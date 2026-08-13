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
import { useEvmPetsConfig } from './src/petsContractParams';
import { ToastProvider } from './src/components/ui/toast';
import SignInErrorReporter from './src/components/SignInErrorReporter';
import { RootNavigator } from './src/navigation/RootNavigator';
import { neon } from './src/theme/neon';
import { SolanaAppKitAnchorBridge } from './src/solana/SolanaAppKitAnchorBridge';
import { SolanaAuthSigner } from './src/solana/SolanaAuthSigner';

/**
 * Provider order matches `frontend/src/AppProviders.tsx`, with `NavigationContainer`
 * where its `BrowserRouter` sits.
 *
 * `SafeAreaProvider` is outermost so `ToastProvider` can measure a real bottom
 * inset rather than assuming one. `AppKit` renders as a sibling of the navigator
 * so its connect sheet is reachable from the landing screen and the tab shell
 * alike.
 *
 * `SolanaAuthSigner` is a non-wrapping sibling inside `AppKitProvider`, matching
 * where `AppProviders.tsx` puts its own: it registers rather than provides, and
 * it has to sit above `AuthProvider`, which reads what it registers.
 */

/**
 * Supplies the contract config for whichever deployment chain the wallet is on.
 *
 * A component rather than a constant because the config now depends on
 * `useAccount`, and hooks only run inside the tree. It has to sit under
 * `WagmiProvider`, which it does.
 */
function PetsConfig({ children }: { children: React.ReactNode }) {
  return <PetsConfigProvider evm={useEvmPetsConfig()}>{children}</PetsConfigProvider>;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={neon.bgDeep} />
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <AppKitProvider instance={appKit}>
            <SolanaAuthSigner />
            <SolanaAppKitAnchorBridge>
              <ApiClientProvider baseURL={API_URL}>
                <AuthProvider>
                  <PetsConfig>
                    <ToastProvider>
                      {/* Inside ToastProvider and under AuthProvider, which is what it needs. */}
                      <SignInErrorReporter />
                      <NavigationContainer>
                        <RootNavigator />
                      </NavigationContainer>
                      <AppKit />
                    </ToastProvider>
                  </PetsConfig>
                </AuthProvider>
              </ApiClientProvider>
            </SolanaAppKitAnchorBridge>
          </AppKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </SafeAreaProvider>
  );
}
