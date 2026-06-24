import React from 'react';
import { useAuth } from '@shared/core';
import NeonButton, { type NeonButtonProps } from '@components/ui/neon-button';

type Props = NeonButtonProps;

/**
 * Primary action button that gates on auth: when signed out it becomes a
 * "Sign in to Play" button driving the wallet sign-in flow; when signed in it
 * renders the given action. Styled via the shared <NeonButton> (tone/size props).
 */
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
            <NeonButton onClick={() => signAndLogin()} disabled={isSigningIn} {...rest}>
                {isSigningIn ? signingLabel : 'Sign in to Play'}
            </NeonButton>
        );
    }

    return (
        <NeonButton onClick={onClick} disabled={disabled} {...rest}>
            {children}
        </NeonButton>
    );
};

export default AuthActionButton;
