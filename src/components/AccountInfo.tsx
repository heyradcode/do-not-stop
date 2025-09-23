import React, { useEffect } from 'react';
import { useAccount } from 'wagmi';
import WalletConnection from './WalletConnection';
import './AccountInfo.css';

const AccountInfo: React.FC = () => {
  const { address, isConnected, chain, status } = useAccount();

  useEffect(() => {
    console.log("Account status:", { address, isConnected, chain, status });
  }, [address, isConnected, chain, status]);

  return (
    <div className="wallet-container">
      <h1>Wallet Connection Status</h1>
      <WalletConnection />
    </div>
  );
};

export default AccountInfo;
