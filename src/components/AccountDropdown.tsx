import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi';
import { formatEther } from 'viem';
import { useAuth } from '../contexts/AuthContext';
import { getNativeTokenSymbol } from '../constants/chains';
import { getPopularTokens } from '../constants/tokens';
import NetworkSwitcher from './NetworkSwitcher';
import TokenBalance from './TokenBalance';
import './AccountDropdown.css';

const AccountDropdown: React.FC = () => {
    const { address, isConnected, chain } = useAccount();
    const { connect, connectors, isPending: isConnecting } = useConnect();
    const { disconnect } = useDisconnect();
    const [isOpen, setIsOpen] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [tokensWithBalance, setTokensWithBalance] = useState<Set<string>>(new Set());
    const [tokensFetched, setTokensFetched] = useState<Set<string>>(new Set());
    const [isTokensLoading, setIsTokensLoading] = useState(false);
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
        address,
    });

    // Memoize popular tokens to prevent infinite re-renders
    const popularTokens = useMemo(() => getPopularTokens(chain?.id), [chain?.id]);

    // Refetch balance when dropdown opens
    useEffect(() => {
        if (isOpen && address) {
            refetchBalance();
            // Reset token balances when opening dropdown
            setTokensWithBalance(new Set());
            setTokensFetched(new Set());
            setIsTokensLoading(true);
        }
    }, [isOpen, address, refetchBalance]);

    // Check if all tokens are fetched and update loading state
    useEffect(() => {
        if (isTokensLoading && tokensFetched.size === popularTokens.length) {
            setIsTokensLoading(false);
        }
    }, [tokensFetched.size, popularTokens.length, isTokensLoading]);

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

    const handleTokenBalanceLoaded = (tokenAddress: string, hasBalance: boolean) => {
        setTokensWithBalance(prev => {
            const newSet = new Set(prev);
            if (hasBalance) {
                newSet.add(tokenAddress);
            } else {
                newSet.delete(tokenAddress);
            }
            return newSet;
        });

        // Mark token as fetched
        setTokensFetched(prev => new Set(prev).add(tokenAddress));
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
                            {/* Native Balance Section */}
                            <div className="balance-section">
                                <div className="balance-label">Native Balance</div>
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

                            {/* ERC-20 Tokens Section */}
                            {popularTokens.length > 0 && (
                                <div className="tokens-section">
                                    <div className="tokens-label">Token Balances</div>
                                    <div className="tokens-list">
                                        {popularTokens.map((token) => (
                                            <TokenBalance
                                                key={token.address}
                                                tokenAddress={token.address}
                                                userAddress={address}
                                                symbol={token.symbol}
                                                decimals={token.decimals}
                                                name={token.name}
                                                onBalanceLoaded={(hasBalance) =>
                                                    handleTokenBalanceLoaded(token.address, hasBalance)
                                                }
                                            />
                                        ))}
                                        {/* Debug info - remove this later */}
                                        <div style={{ fontSize: '10px', color: '#999', margin: '4px 0' }}>
                                            Debug: Fetched: {tokensFetched.size}/{popularTokens.length},
                                            With Balance: {tokensWithBalance.size},
                                            Loading: {isTokensLoading ? 'Yes' : 'No'}
                                        </div>
                                        {/* Show "no ERC-20 tokens" message when all tokens are fetched and none have balance */}
                                        {!isTokensLoading &&
                                            tokensFetched.size === popularTokens.length &&
                                            tokensWithBalance.size === 0 && (
                                                <div className="no-tokens-message">
                                                    No ERC-20 tokens
                                                </div>
                                            )}
                                    </div>
                                </div>
                            )}

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
