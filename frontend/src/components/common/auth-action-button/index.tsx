import React from 'react';
import { useAuth } from '@shared/core';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement>;

const AuthActionButton: React.FC<Props> = ({ onClick, disabled, children, ...rest }) => {
    const { isAuthenticated, signAndLogin, isSigning, isVerifying, isNonceLoading } = useAuth();

    if (!isAuthenticated) {
        const isSigningIn = isNonceLoading || isSigning || isVerifying;
        const signingLabel = isNonceLoading
            ? 'Getting nonce…'
            : isSigning
              ? 'Check your wallet…'
              : 'Verifying…';
        return (
            <button type="button" onClick={() => signAndLogin()} disabled={isSigningIn} {...rest}>
                {isSigningIn ? signingLabel : 'Sign in to Play'}
            </button>
        );
    }

    return (
        <button type="button" onClick={onClick} disabled={disabled} {...rest}>
            {children}
        </button>
    );
};

export default AuthActionButton;
