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

        const fetchSolanaBalance = async () => {
            setIsSolanaLoading(true);
            setSolanaError(null);

            try {
                const balance = await connection.getBalance(publicKey);
                setSolanaBalance(balance / LAMPORTS_PER_SOL);
            } catch (err) {
                setSolanaError(err instanceof Error ? err.message : 'Failed to fetch balance');
            } finally {
                setIsSolanaLoading(false);
            }
        };

        fetchSolanaBalance();

        // Set up polling for balance updates
        const interval = setInterval(fetchSolanaBalance, 10000); // Update every 10 seconds

        return () => clearInterval(interval);
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

    if (error) {
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
