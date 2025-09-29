import React from 'react';
import { useAccount, useBalance } from 'wagmi';
import { formatEther } from 'viem';
import { getNativeTokenSymbol } from '../../constants/chains';
import './NativeBalance.css';

const NativeBalance: React.FC = () => {
    const { address, isConnected, chain } = useAccount();

    const { data: balance, isLoading, error } = useBalance({
        address,
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

    const formattedBalance = formatEther(balance.value);
    const symbol = getNativeTokenSymbol(chain?.id);

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
