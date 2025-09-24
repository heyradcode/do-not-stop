import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAccount, useConnect, useDisconnect, useBalance, usePublicClient } from 'wagmi';
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
    // tokenStatus maps tokenAddress -> { fetched: boolean; balance?: bigint | number }
    const [tokenStatus, setTokenStatus] = useState<Record<string, { fetched: boolean; balance?: bigint | number }>>({});
    const [isTokensLoading, setIsTokensLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const {
        isAuthenticated,
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

    const publicClient = usePublicClient();

    // Refetch balance when dropdown opens - batch fetch ERC-20 balances
    useEffect(() => {
        const fetchTokenBalances = async () => {
            if (!address) return;
            if (!publicClient) return;
            setIsTokensLoading(true);

            try {
                // Build multicall requests for balanceOf
                const calls = popularTokens.map(token => ({
                    address: token.address as `0x${string}`,
                    abi: [{
                        type: 'function',
                        name: 'balanceOf',
                        stateMutability: 'view',
                        inputs: [{ name: 'owner', type: 'address' }],
                        outputs: [{ name: '', type: 'uint256' }]
                    }],
                    functionName: 'balanceOf',
                    args: [address]
                }));

                let results: Array<{ address: string; balance?: bigint | number; error?: any }> = [];

                if ((publicClient as any)?.multicall) {
                    try {
                        // Use the correct viem multicall syntax
                        const multicallRes = await (publicClient as any).multicall({
                            contracts: calls,
                            allowFailure: true
                        });

                        results = multicallRes.map((r: any, idx: number) => ({
                            address: calls[idx].address,
                            balance: r.status === 'success' ? r.result : undefined,
                            error: r.status === 'failure' ? r.error : undefined
                        }));
                    } catch (multicallError) {
                        throw multicallError;
                    }
                } else {
                    throw new Error('Multicall not available');
                }

                // Build tokenStatus map in one update
                const newStatus: Record<string, { fetched: boolean; balance?: bigint | number }> = {};
                for (const r of results) {
                    newStatus[r.address.toLowerCase()] = {
                        fetched: true,
                        balance: r.balance !== undefined ? r.balance : 0n
                    };
                }

                setTokenStatus(newStatus);
            } catch (err) {
                // Error fetching token balances
            } finally {
                setIsTokensLoading(false);
            }
        };

        if (isOpen && address) {
            refetchBalance();
            // Reset token status when opening dropdown
            setTokenStatus({});
            fetchTokenBalances();
        }
    }, [isOpen, address, refetchBalance, publicClient, popularTokens]);

    // derived counts
    const fetchedCount = Object.values(tokenStatus).filter(s => s.fetched).length;
    const withBalanceCount = Object.values(tokenStatus).filter(s => {
        if (!s.balance) return false;
        return typeof s.balance === 'bigint' ? s.balance > 0n : Number(s.balance) > 0;
    }).length;

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
                setIsCopied(true);
                // Reset the copied state after 2 seconds
                setTimeout(() => setIsCopied(false), 2000);
            } catch (err) {
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

    // token balances are handled by parent batch fetch; no per-token callback needed

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
                                                symbol={token.symbol}
                                                decimals={token.decimals}
                                                name={token.name}
                                                balance={tokenStatus[token.address.toLowerCase()]?.balance}
                                            />
                                        ))}
                                        {/* Show "no ERC-20 tokens" message when all tokens are fetched and none have balance */}
                                        {!isTokensLoading &&
                                            fetchedCount === popularTokens.length &&
                                            withBalanceCount === 0 && (
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
