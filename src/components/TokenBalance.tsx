import React from 'react';
import { useReadContract } from 'wagmi';
import { formatTokenBalance, ERC20_ABI } from '../constants/tokens';
import './TokenBalance.css';

interface TokenBalanceProps {
    tokenAddress: `0x${string}`;
    userAddress: `0x${string}`;
    symbol: string;
    decimals: number;
    name: string;
    onBalanceLoaded?: (hasBalance: boolean) => void;
}

const TokenBalance: React.FC<TokenBalanceProps> = ({
    tokenAddress,
    userAddress,
    symbol,
    decimals,
    name,
    onBalanceLoaded,
}) => {
    const { data: balance, isLoading, error } = useReadContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [userAddress],
    });


    // Notify parent component about balance status
    React.useEffect(() => {
        if (!isLoading) {
            // Always call the callback when loading is done, even if there's an error or no balance
            onBalanceLoaded?.(balance !== undefined && balance > 0n);
        }
    }, [isLoading, error, balance, onBalanceLoaded]);

    // Show loading state
    if (isLoading) {
        return (
            <div className="token-balance loading">
                <div className="token-info">
                    <span className="token-symbol">{symbol}</span>
                    <span className="token-name">{name}</span>
                </div>
                <div className="token-amount">
                    <div className="loading">
                        <div className="loading-spinner"></div>
                        <span>Loading...</span>
                    </div>
                </div>
            </div>
        );
    }

    // Don't render anything if there's an error
    if (error || !balance) {
        return null;
    }

    // Only show tokens with non-zero balance
    if (balance === 0n) {
        return null;
    }

    const formattedBalance = formatTokenBalance(balance, decimals);
    const displayBalance = parseFloat(formattedBalance).toFixed(4);

    return (
        <div className="token-balance">
            <div className="token-info">
                <span className="token-symbol">{symbol}</span>
                <span className="token-name">{name}</span>
            </div>
            <div className="token-amount">
                <span className="balance-value">{displayBalance}</span>
                <span className="balance-symbol">{symbol}</span>
            </div>
        </div>
    );
};

export default TokenBalance;
