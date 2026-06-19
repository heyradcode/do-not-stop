import React from 'react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { useAuth, useChainCapabilities } from '@shared/core';
import { Tones } from '@constants/tones';
import { NeonButton } from '@components/ui';
import './sign-in-gate.css';

const SignInGate: React.FC = () => {
    const { setShowAuthFlow } = useDynamicContext();
    const { isConnected, walletAddress } = useChainCapabilities();
    const { signAndLogin, isSigning, isVerifying, isNonceLoading } = useAuth();

    const formatAddress = (addr: string) =>
        `${addr.slice(0, 6)}…${addr.slice(-4)}`;

    const signingLabel =
        isNonceLoading ? 'Preparing…' :
        isSigning      ? 'Sign in your wallet…' :
        isVerifying    ? 'Verifying…' :
        'Sign in with Wallet';

    return (
        <div className="sign-in-gate">
            <div className="sign-in-card">
                <div className="sign-in-icon" aria-hidden>🔐</div>

                <h2 className="sign-in-title">Sign in to Play</h2>
                <p className="sign-in-desc">
                    Authenticate with your wallet to access Crypto Pets.
                    Your signature proves ownership — no password needed.
                </p>

                {isConnected && walletAddress && (
                    <div className="sign-in-address">
                        <span className="sign-in-address-label">Connected as</span>
                        <span className="sign-in-address-value">{formatAddress(walletAddress)}</span>
                    </div>
                )}

                <div className="sign-in-actions">
                    {isConnected ? (
                        <NeonButton
                            tone={Tones.Emerald}
                            onClick={() => void signAndLogin()}
                            disabled={isSigning || isVerifying || isNonceLoading}
                            fullWidth
                        >
                            {signingLabel}
                        </NeonButton>
                    ) : (
                        <NeonButton
                            tone={Tones.Azure}
                            onClick={() => setShowAuthFlow(true)}
                            fullWidth
                        >
                            Connect Wallet
                        </NeonButton>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SignInGate;
