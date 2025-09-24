import React from 'react';
import { useAccount, useBalance } from 'wagmi';
import { formatEther } from 'viem';
import './NativeBalance.css';

const NativeBalance: React.FC = () => {
    const { address, isConnected, chain } = useAccount();

    const { data: balance, isLoading, error } = useBalance({
        address: address,
    });

    if (!isConnected || !address) {
        return null;
    }

    if (isLoading) {
        return (
            <div className="native-balance">
                <div className="balance-loading">
                    <div className="loading-spinner"></div>
                    <span>Loading balance...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="native-balance">
                <div className="balance-error">
                    <span>❌ Error loading balance</span>
                </div>
            </div>
        );
    }

    if (!balance) {
        return null;
    }

    // Get the native token symbol from the current chain
    const getNativeTokenSymbol = () => {
        if (!chain) return 'ETH';

        // Map common chain IDs to their native token symbols
        const chainSymbols: { [key: number]: string } = {
            1: 'ETH',        // Ethereum Mainnet
            11155111: 'ETH', // Sepolia
            56: 'BNB',       // BSC
            97: 'tBNB',      // BSC Testnet
            137: 'MATIC',    // Polygon
            80001: 'MATIC',  // Mumbai
            42161: 'ETH',    // Arbitrum
            421614: 'ETH',   // Arbitrum Sepolia
            10: 'ETH',       // Optimism
            11155420: 'ETH', // Optimism Sepolia
            43114: 'AVAX',   // Avalanche
            43113: 'AVAX',   // Fuji
            8453: 'ETH',     // Base
            84532: 'ETH',    // Base Sepolia
            250: 'FTM',      // Fantom
            4002: 'FTM',     // Fantom Testnet
            42220: 'CELO',   // Celo
            44787: 'CELO',   // Alfajores
            100: 'GNO',      // Gnosis
            10200: 'GNO',    // Chiado
        };

        return chainSymbols[chain.id] || 'ETH';
    };

    const formattedBalance = formatEther(balance.value);
    const symbol = getNativeTokenSymbol();

    return (
        <div className="native-balance">
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
