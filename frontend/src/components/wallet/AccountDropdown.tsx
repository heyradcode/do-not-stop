import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useWallet } from '@solana/wallet-adapter-react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { useAuth } from '@shared/core';
import { getPopularTokens } from '../../constants/tokens';
import { NeonButton, NeonCard } from '../common';
import Icon, { CheckIcon, CopyIcon } from '../common/Icon';
import { EthereumNetworkSwitcher, SolanaNetworkSwitcher } from './NetworkSwitcher';
import TokenBalance from './TokenBalance';
import NativeBalance from './NativeBalance';
import './AccountDropdown.css';

const AccountDropdown: React.FC = () => {
    const { address, isConnected, chain } = useAccount();
    const { publicKey: solanaPublicKey, connected: solanaConnected, disconnect: solanaDisconnect } = useWallet();
    const { setShowAuthFlow, handleLogOut, user, primaryWallet } = useDynamicContext();
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

    /** Phantom (and others) opened via Dynamic’s modal live on `primaryWallet`, not on `@solana/wallet-adapter-react`. */
    const dynamicWalletAddress = primaryWallet?.address ?? undefined;
    const dynamicSession = Boolean(user || primaryWallet);

    const headerTriggerLabel =
        (address && formatAddress(address)) ||
        (solanaPublicKey && formatAddress(solanaPublicKey.toString())) ||
        (dynamicWalletAddress && formatAddress(dynamicWalletAddress)) ||
        'Connected';

    // Wagmi, wallet-adapter, or Dynamic “connect-only” session (incl. Solana-only via Dynamic modal).
    const hasAnyWallet = isConnected || solanaConnected || dynamicSession;

    if (!hasAnyWallet) {
        return (
            <div className="account-dropdown-container">
                <NeonButton tone="azure" className="connect-wallet-btn" onClick={() => setShowAuthFlow(true)}>
                    Connect Wallet
                </NeonButton>
            </div>
        );
    }


    return (
        <div className="account-dropdown-container">
            {isConnected && <EthereumNetworkSwitcher />}
            {solanaConnected && <SolanaNetworkSwitcher />}
            <div className="account-dropdown" ref={dropdownRef}>
                <NeonButton
                    className="wallet-trigger-btn"
                    onClick={() => setIsOpen(!isOpen)}
                    tone="azure"
                    size="sm"
                >
                    {headerTriggerLabel}{' '}
                    {isOpen ? '▲' : '▼'}
                </NeonButton>

                {isOpen && (
                    <NeonCard as="section" className="user-dropdown-menu">
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
                                            <Icon
                                                as={isCopied ? CheckIcon : CopyIcon}
                                                tone={isCopied ? 'emerald' : 'cyan'}
                                                glow="none"
                                                className="no-gap"
                                            />
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
                                            <Icon
                                                as={isCopied ? CheckIcon : CopyIcon}
                                                tone={isCopied ? 'emerald' : 'cyan'}
                                                glow="none"
                                                className="no-gap"
                                            />
                                        </span>
                                    </div>
                                )}
                                {dynamicWalletAddress &&
                                    dynamicWalletAddress !== address &&
                                    dynamicWalletAddress !== solanaPublicKey?.toString() && (
                                        <div
                                            className={`user-address-full clickable-address ${isCopied ? 'copied' : ''}`}
                                            onClick={() => {
                                                void navigator.clipboard.writeText(dynamicWalletAddress);
                                                setIsCopied(true);
                                                setTimeout(() => setIsCopied(false), 2000);
                                            }}
                                            title={isCopied ? "Address copied!" : "Click to copy address"}
                                        >
                                            <span className="address-text">{dynamicWalletAddress}</span>
                                            <span className="copy-icon">
                                                <Icon
                                                    as={isCopied ? CheckIcon : CopyIcon}
                                                    tone={isCopied ? 'emerald' : 'cyan'}
                                                    glow="none"
                                                    className="no-gap"
                                                />
                                            </span>
                                        </div>
                                    )}
                            </div>
                        </div>

                        <div className="dropdown-content">
                            {/* Ethereum/EVM Balance Section */}
                            {isConnected && address && (
                                <NeonCard as="div" className="balance-section">
                                    <div className="balance-label">Ethereum Balance</div>
                                    <NativeBalance type="ethereum" />
                                </NeonCard>
                            )}

                            {/* Solana Balance Section */}
                            {solanaConnected && solanaPublicKey && (
                                <NeonCard as="div" className="balance-section">
                                    <div className="balance-label">Solana Balance</div>
                                    <NativeBalance type="solana" />
                                </NeonCard>
                            )}

                            {/* ERC-20 Tokens Section */}
                            {popularTokens.length > 0 && (
                                <NeonCard as="div" className="tokens-section">
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
                                </NeonCard>
                            )}

                            {/* Action Buttons */}
                            <div className="dropdown-actions">
                                {!isAuthenticated ? (
                                    <NeonButton
                                        className="dropdown-neon-btn"
                                        onClick={handleSignAndLogin}
                                        disabled={isNonceLoading || isSigning || isVerifying}
                                        tone="azure"
                                        size="sm"
                                        fullWidth
                                    >
                                        {isNonceLoading ? 'Getting nonce...' :
                                            isSigning ? 'Please approve the signature in your wallet...' :
                                                isVerifying ? 'Verifying...' : 'Sign Message & Login'}
                                    </NeonButton>
                                ) : (
                                    <NeonButton
                                        className="dropdown-neon-btn"
                                        onClick={handleLogout}
                                        tone="cyan"
                                        size="sm"
                                        fullWidth
                                    >
                                        Logout
                                    </NeonButton>
                                )}

                                {(isConnected || user || primaryWallet) && (
                                    <NeonButton
                                        className="dropdown-neon-btn"
                                        onClick={handleDisconnect}
                                        tone="amber"
                                        size="sm"
                                        fullWidth
                                    >
                                        Disconnect
                                    </NeonButton>
                                )}

                                {solanaConnected && (
                                    <NeonButton
                                        className="dropdown-neon-btn"
                                        onClick={() => {
                                            solanaDisconnect();
                                            setIsOpen(false);
                                        }}
                                        tone="amber"
                                        size="sm"
                                        fullWidth
                                    >
                                        Disconnect
                                    </NeonButton>
                                )}
                            </div>
                        </div>
                    </NeonCard>
                )}
            </div>
        </div>
    );
};

export default AccountDropdown;
