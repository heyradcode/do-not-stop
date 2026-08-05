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

jest.mock('@reown/appkit-react-native', () => ({AppKitProvider: passthrough}));
jest.mock('wagmi', () => ({WagmiProvider: passthrough}));
jest.mock('@tanstack/react-query', () => ({QueryClientProvider: passthrough}));
jest.mock('@shared/core', () => ({
  queryClient: {},
  ApiClientProvider: passthrough,
  AuthProvider: passthrough,
  PetsConfigProvider: passthrough,
}));
jest.mock('../src/AppKitConfig', () => ({appKit: {}, wagmiConfig: {}}));
jest.mock('../src/solana/SolanaAppKitAnchorBridge', () => ({
  SolanaAppKitAnchorBridge: passthrough,
}));
jest.mock('../src/AppContent.tsx', () => () => null);
// Reaches AsyncStorage (a native module) at import time, just to read API_URL.
jest.mock('../config', () => ({API_URL: 'http://localhost:3001'}));

import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
