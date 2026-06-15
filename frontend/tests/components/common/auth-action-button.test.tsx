import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const auth = {
    isAuthenticated: false,
    signAndLogin: vi.fn(),
    isSigning: false,
    isVerifying: false,
    isNonceLoading: false,
};
vi.mock('@shared/core', () => ({ useAuth: () => auth }));

import AuthActionButton from '@components/common/auth-action-button';

beforeEach(() => {
    vi.clearAllMocks();
    auth.isAuthenticated = false;
    auth.isSigning = false;
    auth.isVerifying = false;
    auth.isNonceLoading = false;
});

describe('AuthActionButton (signed out)', () => {
    it('prompts to sign in and triggers signAndLogin on click', async () => {
        render(<AuthActionButton>Play</AuthActionButton>);

        const btn = screen.getByRole('button', { name: 'Sign in to Play' });
        expect(btn).toBeEnabled();

        await userEvent.click(btn);
        expect(auth.signAndLogin).toHaveBeenCalledOnce();
    });

    it('shows the nonce-loading label and disables the button', () => {
        auth.isNonceLoading = true;
        render(<AuthActionButton>Play</AuthActionButton>);

        const btn = screen.getByRole('button', { name: 'Getting nonce…' });
        expect(btn).toBeDisabled();
    });

    it('shows the signing label', () => {
        auth.isSigning = true;
        render(<AuthActionButton>Play</AuthActionButton>);
        expect(screen.getByRole('button', { name: 'Check your wallet…' })).toBeDisabled();
    });

    it('shows the verifying label', () => {
        auth.isVerifying = true;
        render(<AuthActionButton>Play</AuthActionButton>);
        expect(screen.getByRole('button', { name: 'Verifying…' })).toBeDisabled();
    });
});

describe('AuthActionButton (signed in)', () => {
    beforeEach(() => {
        auth.isAuthenticated = true;
    });

    it('renders children and forwards onClick', async () => {
        const onClick = vi.fn();
        render(<AuthActionButton onClick={onClick}>Feed pet</AuthActionButton>);

        const btn = screen.getByRole('button', { name: 'Feed pet' });
        await userEvent.click(btn);

        expect(onClick).toHaveBeenCalledOnce();
        expect(auth.signAndLogin).not.toHaveBeenCalled();
    });

    it('respects the disabled prop', () => {
        render(
            <AuthActionButton disabled>
                Feed pet
            </AuthActionButton>,
        );
        expect(screen.getByRole('button', { name: 'Feed pet' })).toBeDisabled();
    });
});
