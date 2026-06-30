import React from 'react';
import { formatTokenBalance } from '@constants/tokens';
import s from './index.module.css';

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
        <div className={s.tokenBalance}>
            <div className={s.info}>
                <span className={s.symbol}>{symbol}</span>
                <span className={s.name}>{name}</span>
            </div>
            <div className={s.amount}>
                <span className={s.value}>{displayBalance}</span>
                <span className={s.symbol}>{symbol}</span>
            </div>
        </div>
    );
};

export default TokenBalance;
