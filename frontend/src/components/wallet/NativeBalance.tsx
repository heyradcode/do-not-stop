import React, { useState, useEffect } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { formatEther } from 'viem';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getNativeTokenSymbol } from '../../constants/chains/ethereum';
import './NativeBalance.css';

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
    const { data: ethereumBalance, isLoading: isEthereumLoading, error: ethereumError } = useBalance({
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

    // Debug logging for Solana balance
    if (type === 'solana') {
        console.log('Solana Balance Debug:', {
            solanaConnected,
            publicKey: publicKey?.toString(),
            solanaBalance,
            isSolanaLoading,
            solanaError
        });
    }

    const isLoading = type === 'ethereum' ? isEthereumLoading : isSolanaLoading;
    const error = type === 'ethereum' ? ethereumError : solanaError;
    const balance = type === 'ethereum' ? ethereumBalance : solanaBalance;

    if (isLoading) {
        return (
            <div className={`native-balance ${className || ''}`}>
                <div className="balance-loading">
                    <div className="loading-spinner"></div>
                    <span>Loading balance...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`native-balance ${className || ''}`}>
                <div className="balance-error">
                    <span>❌ Error loading balance</span>
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
            <div className={`native-balance ${className || ''}`}>
                <div className="balance-info">
                    <span className="balance-amount">0.0000</span>
                    <span className="balance-symbol">SOL</span>
                </div>
            </div>
        );
    }

    let formattedBalance: string;
    let symbol: string;

    if (type === 'ethereum') {
        formattedBalance = formatEther((balance as any).value);
        symbol = getNativeTokenSymbol(chain?.id);
    } else {
        formattedBalance = (balance as number).toFixed(4);
        symbol = 'SOL';
    }

    return (
        <div className={`native-balance ${className || ''}`}>
            <div className="balance-info">
                <span className="balance-amount">
                    {parseFloat(formattedBalance).toFixed(4)}
                </span>
                <span className="balance-symbol">{symbol}</span>
            </div>
        </div>
    );
};

export default NativeBalance;
