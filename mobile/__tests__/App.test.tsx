/**
 * @format
 *
 * App.tsx is provider composition and nothing else, so rendering it for real would boot
 * wagmi, AppKit, @solana/web3.js and the whole shared stack — none of which parse under
 * jest without transforming a large slice of node_modules. The providers are stubbed to
 * pass children through, which leaves the thing actually worth checking here: that App's
 * imports all resolve and its tree renders without throwing.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

const passthrough = ({children}: {children?: React.ReactNode}) => <>{children}</>;

// `useProvider`/`useAccount` are here for `SolanaAuthSigner`, which App renders as a
// non-wrapping sibling. They became necessary when `SafeAreaProvider` started being mocked
// globally: the real one measures a native view and renders `null` until it has metrics, so
// under jest nothing below App's outermost provider had ever mounted and this test was
// checking that the imports resolve, not that the tree renders.
jest.mock('@reown/appkit-react-native', () => ({
  AppKitProvider: passthrough,
  AppKit: () => null,
  useProvider: () => ({provider: null}),
  useAccount: () => ({address: undefined, isConnected: false, namespace: undefined, chainId: undefined}),
}));
jest.mock('wagmi', () => ({WagmiProvider: passthrough, useAccount: () => ({chainId: undefined})}));
jest.mock('@tanstack/react-query', () => ({QueryClientProvider: passthrough}));
jest.mock('@shared/core', () => ({
  queryClient: {},
  ApiClientProvider: passthrough,
  AuthProvider: passthrough,
  PetsConfigProvider: passthrough,
  useAuth: () => ({signInError: null}),
  setSolanaAuthSigner: () => {},
}));
jest.mock('../src/AppKitConfig', () => ({appKit: {}, wagmiConfig: {}}));
jest.mock('../src/solana/SolanaAppKitAnchorBridge', () => ({
  SolanaAppKitAnchorBridge: passthrough,
}));
jest.mock('@react-navigation/native', () => ({NavigationContainer: passthrough}));
jest.mock('../src/navigation/RootNavigator', () => ({RootNavigator: () => null}));
// Reaches AsyncStorage (a native module) at import time, just to read API_URL.
jest.mock('../config', () => ({API_URL: 'http://localhost:3001'}));
/**
 * Without this, `SafeAreaProvider` measures a native view and renders `null`, so nothing below
 * App's outermost provider mounts and the test below checks that the imports resolve rather
 * than that the tree renders. The stubs above only matter because this makes it mount.
 */
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);


import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
