import React, { useEffect } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const SolanaWalletTrigger: React.FC = () => {
    useEffect(() => {
        const handleSolanaConnect = () => {
            // Find the Solana wallet button and click it
            const solanaButton = document.querySelector('.wallet-adapter-button');
            if (solanaButton) {
                (solanaButton as HTMLElement).click();
            }
        };

        // Listen for the custom event
        window.addEventListener('solana-connect', handleSolanaConnect);

        return () => {
            window.removeEventListener('solana-connect', handleSolanaConnect);
        };
    }, []);

    return (
        <div style={{ display: 'none' }}>
            <WalletMultiButton />
        </div>
    );
};

export default SolanaWalletTrigger;
