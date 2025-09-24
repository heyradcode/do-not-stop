import React, { useState, useEffect, useRef } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useBalance } from 'wagmi';
import { formatEther } from 'viem';
import { useAuth } from '../contexts/AuthContext';
import { getNativeTokenSymbol } from '../constants/chains';
import NetworkSwitcher from './NetworkSwitcher';
import './AccountDropdown.css';

const AccountDropdown: React.FC = () => {
    const { address, isConnected, chain } = useAccount();
    const { connect, connectors, isPending: isConnecting } = useConnect();
    const { disconnect } = useDisconnect();
    const [isOpen, setIsOpen] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const {
        isAuthenticated,
        user,
        logout,
        signAndLogin,
        isSigning,
        isVerifying,
        isNonceLoading
    } = useAuth();

    // Get native token balance
    const { data: balance, isLoading: isBalanceLoading, refetch: refetchBalance } = useBalance({
        address: address,
    });

    // Refetch balance when dropdown opens
    useEffect(() => {
        if (isOpen && address) {
            refetchBalance();
        }
    }, [isOpen, address, refetchBalance]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [isOpen]);

    const handleConnect = () => {
        const injectedConnector = connectors.find(connector => connector.type === 'injected');
        if (injectedConnector) {
            connect({ connector: injectedConnector });
        }
    };

    const handleDisconnect = () => {
        disconnect();
        setIsOpen(false);
    };

    const handleLogout = () => {
        logout();
        setIsOpen(false);
    };

    const handleSignAndLogin = () => {
        signAndLogin();
        setIsOpen(false);
    };

    const handleCopyAddress = async () => {
        if (address) {
            try {
                await navigator.clipboard.writeText(address);
                console.log('Address copied to clipboard');
                setIsCopied(true);
                // Reset the copied state after 2 seconds
                setTimeout(() => setIsCopied(false), 2000);
            } catch (err) {
                console.error('Failed to copy address:', err);
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = address;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                setIsCopied(true);
                // Reset the copied state after 2 seconds
                setTimeout(() => setIsCopied(false), 2000);
            }
        }
    };

    // Format address for display
    const formatAddress = (addr: string) => {
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };


    if (!isConnected || !address) {
        return (
            <div className="account-dropdown-container">
                <button
                    className="connect-wallet-btn"
                    onClick={handleConnect}
                    disabled={isConnecting}
                >
                    {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                </button>
            </div>
        );
    }

    const formattedBalance = balance ? formatEther(balance.value) : '0';
    const symbol = getNativeTokenSymbol(chain?.id);

    return (
        <div className="account-dropdown-container">
            <NetworkSwitcher />
            <div className="account-dropdown" ref={dropdownRef}>
                <button
                    className="user-trigger"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <div className="user-info">
                        <span className="user-address">{formatAddress(address)}</span>
                    </div>
                    <div className="dropdown-arrow">
                        {isOpen ? '▲' : '▼'}
                    </div>
                </button>

                {isOpen && (
                    <div className="user-dropdown-menu">
                        <div className="dropdown-header">
                            <div className="user-details">
                                <div
                                    className={`user-address-full clickable-address ${isCopied ? 'copied' : ''}`}
                                    onClick={handleCopyAddress}
                                    title={isCopied ? "Address copied!" : "Click to copy address"}
                                >
                                    <span className="address-text">{address}</span>
                                    <span className="copy-icon">
                                        {isCopied ? "✓" : "📋"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="dropdown-content">
                            {/* Balance Section */}
                            <div className="balance-section">
                                <div className="balance-label">Balance</div>
                                <div className="balance-amount">
                                    {isBalanceLoading ? (
                                        <div className="balance-loading">
                                            <div className="loading-spinner"></div>
                                            <span>Loading...</span>
                                        </div>
                                    ) : (
                                        <div className="balance-display">
                                            <span className="balance-value">
                                                {parseFloat(formattedBalance).toFixed(4)}
                                            </span>
                                            <span className="balance-symbol">{symbol}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="dropdown-actions">
                                {!isAuthenticated ? (
                                    <button
                                        className="action-btn primary"
                                        onClick={handleSignAndLogin}
                                        disabled={isNonceLoading || isSigning || isVerifying}
                                    >
                                        {isNonceLoading ? 'Getting nonce...' :
                                            isSigning ? 'Please sign in MetaMask...' :
                                                isVerifying ? 'Verifying...' : 'Sign Message & Login'}
                                    </button>
                                ) : (
                                    <button
                                        className="action-btn secondary"
                                        onClick={handleLogout}
                                    >
                                        Logout
                                    </button>
                                )}

                                <button
                                    className="action-btn danger"
                                    onClick={handleDisconnect}
                                >
                                    Disconnect Wallet
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AccountDropdown;
