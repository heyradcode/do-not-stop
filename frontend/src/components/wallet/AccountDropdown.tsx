import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useWallet } from '@solana/wallet-adapter-react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { useAuth } from '../../contexts';
import { getPopularTokens } from '../../constants/tokens';
import { EthereumNetworkSwitcher, SolanaNetworkSwitcher } from './NetworkSwitcher';
import TokenBalance from './TokenBalance';
import NativeBalance from './NativeBalance';
import './AccountDropdown.css';

const AccountDropdown: React.FC = () => {
    const { address, isConnected, chain } = useAccount();
    const { publicKey: solanaPublicKey, connected: solanaConnected, disconnect: solanaDisconnect } = useWallet();
    const { setShowAuthFlow, handleLogOut } = useDynamicContext();
    const [isOpen, setIsOpen] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    const [tokenStatus, setTokenStatus] = useState<Record<string, { fetched: boolean; balance?: bigint | number }>>({});
    const [isTokensLoading, setIsTokensLoading] = useState(false);
    const dropdownRef = useRef<any>(null);

    const {
        isAuthenticated,
        logout,
        signAndLogin,
        isSigning,
        isVerifying,
        isNonceLoading
    } = useAuth();


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
                    args: [address as `0x${string}`]
                }));

                let results: Array<{ address: string; balance?: bigint | number; error?: unknown }> = [];

                if ((publicClient as { multicall?: unknown })?.multicall) {
                    // Use the correct viem multicall syntax
                    const multicallRes = await (publicClient as { multicall: (params: unknown) => Promise<unknown> }).multicall({
                        contracts: calls,
                        allowFailure: true
                    });

                    results = (multicallRes as Array<{ status: string; result?: unknown; error?: unknown }>).map((r, idx: number) => ({
                        address: calls[idx].address,
                        balance: r.status === 'success' ? (r.result as bigint) : undefined,
                        error: r.status === 'failure' ? r.error : undefined
                    }));
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
            } catch {
                // Error fetching token balances
            } finally {
                setIsTokensLoading(false);
            }
        };

        if (isOpen && address) {
            // Reset token status when opening dropdown
            setTokenStatus({});
            fetchTokenBalances();
        }
    }, [isOpen, address, publicClient, popularTokens]);

    // derived counts
    const fetchedCount = Object.values(tokenStatus).filter(s => s.fetched).length;
    const withBalanceCount = Object.values(tokenStatus).filter(s => {
        if (!s.balance) return false;
        return typeof s.balance === 'bigint' ? s.balance > 0n : Number(s.balance) > 0;
    }).length;

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: globalThis.MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as globalThis.Node)) {
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

    const handleDisconnect = () => {
        handleLogOut();
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
                await globalThis.navigator.clipboard.writeText(address);
                setIsCopied(true);
                // Reset the copied state after 2 seconds
                globalThis.setTimeout(() => setIsCopied(false), 2000);
            } catch {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = address;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                setIsCopied(true);
                // Reset the copied state after 2 seconds
                globalThis.setTimeout(() => setIsCopied(false), 2000);
            }
        }
    };

    // token balances are handled by parent batch fetch; no per-token callback needed

    // Format address for display
    const formatAddress = (addr: string | undefined) => {
        if (!addr) return '';
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    // Show connect button if not connected via Wagmi (which is connected through Dynamic.xyz)
    if (!isConnected) {
        return (
            <div className="account-dropdown-container">
                <button
                    className="connect-wallet-btn"
                    onClick={() => setShowAuthFlow(true)}
                >
                    Connect Wallet
                </button>
            </div>
        );
    }


    return (
        <div className="account-dropdown-container">
            {isConnected && <EthereumNetworkSwitcher />}
            {solanaConnected && <SolanaNetworkSwitcher />}
            <div className="account-dropdown" ref={dropdownRef}>
                <button
                    className="user-trigger"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <div className="user-info">
                        {address && <span className="user-address">{formatAddress(address)}</span>}
                        {solanaPublicKey && <span className="user-address">{formatAddress(solanaPublicKey.toString())}</span>}
                    </div>
                    <div className="dropdown-arrow">
                        {isOpen ? '▲' : '▼'}
                    </div>
                </button>

                {isOpen && (
                    <div className="user-dropdown-menu">
                        <div className="dropdown-header">
                            <div className="user-details">
                                {address && (
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
                                )}
                                {solanaPublicKey && (
                                    <div
                                        className={`user-address-full clickable-address ${isCopied ? 'copied' : ''}`}
                                        onClick={() => {
                                            navigator.clipboard.writeText(solanaPublicKey.toString());
                                            setIsCopied(true);
                                            setTimeout(() => setIsCopied(false), 2000);
                                        }}
                                        title={isCopied ? "Address copied!" : "Click to copy address"}
                                    >
                                        <span className="address-text">{solanaPublicKey.toString()}</span>
                                        <span className="copy-icon">
                                            {isCopied ? "✓" : "📋"}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="dropdown-content">
                            {/* Ethereum/EVM Balance Section */}
                            {isConnected && address && (
                                <div className="balance-section">
                                    <div className="balance-label">Ethereum Balance</div>
                                    <NativeBalance type="ethereum" />
                                </div>
                            )}

                            {/* Solana Balance Section */}
                            {solanaConnected && solanaPublicKey && (
                                <div className="balance-section">
                                    <div className="balance-label">Solana Balance</div>
                                    <NativeBalance type="solana" />
                                </div>
                            )}

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

                                {isConnected && (
                                    <button
                                        className="action-btn danger"
                                        onClick={handleDisconnect}
                                    >
                                        Disconnect Ethereum Wallet
                                    </button>
                                )}

                                {solanaConnected && (
                                    <button
                                        className="action-btn danger"
                                        onClick={() => {
                                            solanaDisconnect();
                                            setIsOpen(false);
                                        }}
                                    >
                                        Disconnect Solana Wallet
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AccountDropdown;
