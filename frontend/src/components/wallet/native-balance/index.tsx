import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import { useAccount, useBalance } from 'wagmi';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { formatEther } from 'viem';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getNativeTokenSymbol } from '@constants/chains/ethereum';
import { Tones } from '@constants/tones';
import Icon, { WarningIcon } from '@components/ui/icon';
import styles from './index.module.css';

export type BalanceType = 'ethereum' | 'solana';

interface NativeBalanceProps {
    type: BalanceType;
    className?: string;
}

const NativeBalance: React.FC<NativeBalanceProps> = ({ type, className }) => {
    const { address, isConnected, chain } = useAccount();
    const { publicKey, connected: solanaConnected } = useWallet();
    const { connection } = useConnection();

    // Ethereum balance
    const {
        data: ethereumBalance,
        isLoading: isEthereumLoading,
        error: ethereumError,
    } = useBalance({
        address,
    });

    // Solana balance state
    const [solanaBalance, setSolanaBalance] = useState<number | null>(null);
    const [isSolanaLoading, setIsSolanaLoading] = useState(false);
    const [solanaError, setSolanaError] = useState<string | null>(null);

    // Fetch Solana balance
    useEffect(() => {
        if (type !== 'solana' || !solanaConnected || !publicKey || !connection) {
            setSolanaBalance(null);
            return;
        }

        // A wallet switch leaves the previous wallet's request in flight, and a late reply
        // would write its balance under the new address. The EVM side gets this from wagmi's
        // query key; here it has to be explicit.
        let cancelled = false;
        // Only the first fetch shows a spinner. Flagging every poll as loading replaced the
        // balance with "Loading balance..." every ten seconds, for as long as the dropdown
        // stayed open — a number that blinks out is harder to read than a slightly stale one.
        let settledOnce = false;

        const fetchSolanaBalance = async () => {
            if (!settledOnce) {
                setIsSolanaLoading(true);
            }

            try {
                const balance = await connection.getBalance(publicKey);
                if (cancelled) return;
                setSolanaBalance(balance / LAMPORTS_PER_SOL);
                setSolanaError(null);
            } catch (err) {
                if (cancelled) return;
                setSolanaError(err instanceof Error ? err.message : 'Failed to fetch balance');
            } finally {
                if (!cancelled) {
                    settledOnce = true;
                    setIsSolanaLoading(false);
                }
            }
        };

        void fetchSolanaBalance();

        // Set up polling for balance updates
        const interval = setInterval(() => void fetchSolanaBalance(), 10000); // Update every 10 seconds

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [type, solanaConnected, publicKey, connection]);

    // Don't render if not connected to the respective network
    if (type === 'ethereum' && (!isConnected || !address)) {
        return null;
    }
    if (type === 'solana' && (!solanaConnected || !publicKey)) {
        return null;
    }

    const isLoading = type === 'ethereum' ? isEthereumLoading : isSolanaLoading;
    const error = type === 'ethereum' ? ethereumError : solanaError;
    const balance = type === 'ethereum' ? ethereumBalance : solanaBalance;

    if (isLoading) {
        return (
            <div className={clsx(styles.nativeBalance, className)}>
                <div className={styles.balanceLoading}>
                    <div className="loading-spinner"></div>
                    <span>Loading balance...</span>
                </div>
            </div>
        );
    }

    // Only when there is nothing to fall back to. A poll that fails after a good read used to
    // swap the number for an error box and back again on the next success, which is the same
    // blink the loading state caused. A balance ten seconds old is more use than that.
    if (error && (balance === null || balance === undefined)) {
        return (
            <div className={clsx(styles.nativeBalance, className)}>
                <div className={styles.balanceError}>
                    <span>
                        <Icon as={WarningIcon} tone={Tones.Amber} />
                        Error loading balance
                    </span>
                </div>
            </div>
        );
    }

    if (balance === null || balance === undefined) {
        return null;
    }

    // Show balance even if it's 0
    if (type === 'solana' && balance === 0) {
        return (
            <div className={clsx(styles.nativeBalance, className)}>
                <div className={styles.balanceInfo}>
                    <span className={styles.balanceAmount}>0.0000</span>
                    <span className={styles.balanceSymbol}>SOL</span>
                </div>
            </div>
        );
    }

    let formattedBalance: string;
    let symbol: string;

    if (type === 'ethereum') {
        formattedBalance = formatEther(ethereumBalance!.value);
        symbol = getNativeTokenSymbol(chain?.id);
    } else {
        formattedBalance = (balance as number).toFixed(4);
        symbol = 'SOL';
    }

    return (
        <div className={clsx(styles.nativeBalance, className)}>
            <div className={styles.balanceInfo}>
                <span className={styles.balanceAmount}>{parseFloat(formattedBalance).toFixed(4)}</span>
                <span className={styles.balanceSymbol}>{symbol}</span>
            </div>
        </div>
    );
};

export default NativeBalance;
