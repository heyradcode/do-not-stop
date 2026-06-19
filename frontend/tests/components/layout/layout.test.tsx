import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@components/wallet/account-dropdown', () => ({ default: () => <div data-testid="account-dropdown" /> }));
vi.mock('@components/wallet/solana-wallet-trigger', () => ({ default: () => <div data-testid="solana-trigger" /> }));
vi.mock('@components/pet/collection/pet-gallery', () => ({ default: () => <div data-testid="pet-gallery" /> }));

const isInteractionRoute = vi.fn();
vi.mock('@constants/interactionRoutes', () => ({
    isInteractionRoute: (...args: unknown[]) => isInteractionRoute(...args),
}));

import Layout from '@components/layout';

const renderLayout = () =>
    render(
        <MemoryRouter initialEntries={['/']}>
            <Routes>
                <Route element={<Layout />}>
                    <Route path="/" element={<div data-testid="page" />} />
                </Route>
            </Routes>
        </MemoryRouter>,
    );

beforeEach(() => {
    vi.clearAllMocks();
    isInteractionRoute.mockReturnValue(false);
});

describe('Layout', () => {
    it('renders the chrome, wallet section and routed page', () => {
        renderLayout();

        expect(screen.getByRole('heading', { name: 'Crypto Pets' })).toBeInTheDocument();
        expect(screen.getByTestId('account-dropdown')).toBeInTheDocument();
        expect(screen.getByTestId('solana-trigger')).toBeInTheDocument();
        expect(screen.getByTestId('page')).toBeInTheDocument();
    });

    it('shows the pet gallery on a normal route', () => {
        renderLayout();
        expect(screen.getByTestId('pet-gallery')).toBeInTheDocument();
    });

    it('hides the pet gallery on a full-page interaction route', () => {
        isInteractionRoute.mockReturnValue(true);
        renderLayout();
        expect(screen.queryByTestId('pet-gallery')).not.toBeInTheDocument();
    });
});
