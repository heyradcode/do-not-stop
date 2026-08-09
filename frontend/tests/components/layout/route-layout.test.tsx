import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// The shell (sidebar/header/ambient/wallet) is covered by its own components;
// here we only assert that RouteLayout composes the shell around the routed page and
// the Solana trigger.
vi.mock('@components/layout/app-shell', () => ({
    default: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="app-shell">{children}</div>
    ),
}));
vi.mock('@components/wallet/solana-wallet-trigger', () => ({
    default: () => <div data-testid="solana-trigger" />,
}));

import RouteLayout from '@components/layout/route-layout';

const renderLayout = () =>
    render(
        <MemoryRouter initialEntries={['/']}>
            <Routes>
                <Route element={<RouteLayout />}>
                    <Route path="/" element={<div data-testid="page" />} />
                </Route>
            </Routes>
        </MemoryRouter>,
    );

describe('RouteLayout', () => {
    it('wraps the routed page and Solana trigger in the app shell', () => {
        renderLayout();

        expect(screen.getByTestId('app-shell')).toBeInTheDocument();
        expect(screen.getByTestId('page')).toBeInTheDocument();
        expect(screen.getByTestId('solana-trigger')).toBeInTheDocument();
    });
});
