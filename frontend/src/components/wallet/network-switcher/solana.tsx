import React from 'react';
import clsx from 'clsx';
import { useWallet } from '@solana/wallet-adapter-react';
import { solanaNetworkNameFromCluster } from '@constants/chains/solana';
import styles from './index.module.css';

interface SolanaNetworkIndicatorProps {
    className?: string;
}

/**
 * Which Solana cluster this build talks to. A label, not a switcher.
 *
 * It used to offer a network list. Selecting one set a local `useState` and did nothing
 * else — no reconnect, no endpoint change — while the checkmark moved, and it opened
 * displaying a hardcoded `'Solana Local'` no matter what the app was actually connected to.
 * Sitting beside the Ethereum switcher, which really does call `switchChain`, it read as
 * working. A wallet control that misreports which chain your assets are on is worse than no
 * control at all.
 *
 * It cannot be made to switch without a larger decision first. The endpoint is fixed at boot
 * by `VITE_SOLANA_CLUSTER` (`AppProviders` → `SolanaWalletProvider`), and `ConnectionProvider`
 * is not the only thing keyed to it: `VITE_CRYPTOPETS_PROGRAM_ID` is one address for one
 * cluster, so moving the connection alone would point every read at a program that does not
 * exist there and answer "account not found" for the whole app. A real switcher needs a
 * program id per cluster, which is a deployment question rather than a UI one.
 *
 * Derived from the same `solanaNetworkNameFromCluster` call `AppProviders` uses, so the label
 * and the connection cannot disagree.
 */
const SolanaNetworkIndicator: React.FC<SolanaNetworkIndicatorProps> = ({ className }) => {
    const { connected } = useWallet();
    if (!connected) return null;

    const network = solanaNetworkNameFromCluster(import.meta.env.VITE_SOLANA_CLUSTER);

    return (
        <div className={clsx(styles.networkSwitcher, className)}>
            {/* Not a button: there is nothing to press. `status` so a screen reader
                announces it as state rather than an action. */}
            <div className={styles.indicator} role="status">
                <span className={styles.name}>{network}</span>
            </div>
        </div>
    );
};

export default SolanaNetworkIndicator;
