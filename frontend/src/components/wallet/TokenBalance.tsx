import React from 'react';
import { formatTokenBalance } from '../../constants/tokens';
import './TokenBalance.css';

interface TokenBalanceProps {
    symbol: string;
    decimals: number;
    name: string;
    // optional balance passed from parent (in wei / bigint)
    balance?: bigint | number | null;
}

const TokenBalance: React.FC<TokenBalanceProps> = ({ symbol, decimals, name, balance }) => {
    // Show nothing if no balance or zero
    if (!balance || (typeof balance === 'bigint' ? balance === 0n : Number(balance) === 0)) {
        return null;
    }

    const formattedBalance = formatTokenBalance(balance as bigint, decimals);
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
