import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useWallet } from '@solana/wallet-adapter-react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { useAuth } from '@shared/core';
import { getPopularTokens } from '@constants/tokens';
import { Tones } from '@constants/tones';
import { NeonButton, NeonCard } from '@components/ui';
import Icon, { CheckIcon, CopyIcon } from '@components/ui/icon';
import { EthereumNetworkSwitcher, SolanaNetworkSwitcher } from '@components/wallet/network-switcher';
import TokenBalance from '@components/wallet/token-balance';
import NativeBalance from '@components/wallet/native-balance';
import './index.css';

interface CopyableAddressProps {
    address: string;
    isCopied: boolean;
    onCopy: () => void;
}

const CopyableAddress: React.FC<CopyableAddressProps> = ({ address, isCopied, onCopy }) => (
    <div
        className={`address ${isCopied ? 'copied' : ''}`}
        onClick={onCopy}
        title={isCopied ? 'Address copied!' : 'Click to copy address'}
    >
        <span className="address-text">{address}</span>
        <span className="copy-icon">
            <Icon
                as={isCopied ? CheckIcon : CopyIcon}
                tone={isCopied ? Tones.Emerald : Tones.Cyan}
                glow="none"
                className="no-gap"
            />
        </span>
    </div>
);

const AccountDropdown: React.FC = () => {
    const { address, isConnected, chain } = useAccount();
    const { publicKey: solanaPublicKey, connected: solanaConnected, disconnect: solanaDisconnect } = useWallet();
    const { setShowAuthFlow, handleLogOut, user, primaryWallet } = useDynamicContext();
    const [isOpen, setIsOpen] = useState(false);
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

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
    const popularTokens = useMemo(() => getPopularTokens(chain?.id), [chain?.id]);

    const publicClient = usePublicClient();

    const handleCopyAny = useCallback(async (text: string) => {
        try {
            await globalThis.navigator.clipboard.writeText(text);
        } catch {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        }
        setCopiedAddress(text);
        globalThis.setTimeout(() => setCopiedAddress(null), 2000);
    }, []);

    useEffect(() => {
        const fetchTokenBalances = async () => {
            if (!address) return;
            if (!publicClient) return;
            setIsTokensLoading(true);

            try {
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
            setTokenStatus({});
            fetchTokenBalances();
        }
    }, [isOpen, address, publicClient, popularTokens]);

    const fetchedCount = Object.values(tokenStatus).filter(s => s.fetched).length;
    const withBalanceCount = Object.values(tokenStatus).filter(s => {
        if (!s.balance) return false;
        return typeof s.balance === 'bigint' ? s.balance > 0n : Number(s.balance) > 0;
    }).length;

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

    const formatAddress = (addr: string | undefined) => {
        if (!addr) return '';
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    const dynamicWalletAddress = primaryWallet?.address ?? undefined;
    const dynamicSession = Boolean(user || primaryWallet);

    const headerTriggerLabel =
        (address && formatAddress(address)) ||
        (solanaPublicKey && formatAddress(solanaPublicKey.toString())) ||
        (dynamicWalletAddress && formatAddress(dynamicWalletAddress)) ||
        'Connected';

    const hasAnyWallet = isConnected || solanaConnected || dynamicSession;

    if (!hasAnyWallet) {
        return (
            <div className="account-dropdown">
                <NeonButton tone={Tones.Azure} className="connect-btn" onClick={() => setShowAuthFlow(true)}>
                    Connect Wallet
                </NeonButton>
            </div>
        );
    }

    return (
        <div className="account-dropdown">
            {isConnected && <EthereumNetworkSwitcher />}
            {solanaConnected && <SolanaNetworkSwitcher />}
            <div className="dropdown" ref={dropdownRef}>
                <NeonButton
                    className="trigger"
                    onClick={() => setIsOpen(!isOpen)}
                    tone={Tones.Azure}
                    size="sm"
                >
                    {headerTriggerLabel}{' '}
                    {isOpen ? '▲' : '▼'}
                </NeonButton>

                {isOpen && (
                    <NeonCard as="section" className="menu">
                        <div className="menu-header">
                            <div className="addresses">
                                {address && (
                                    <CopyableAddress
                                        address={address}
                                        isCopied={copiedAddress === address}
                                        onCopy={() => void handleCopyAny(address)}
                                    />
                                )}
                                {solanaPublicKey && (
                                    <CopyableAddress
                                        address={solanaPublicKey.toString()}
                                        isCopied={copiedAddress === solanaPublicKey.toString()}
                                        onCopy={() => void handleCopyAny(solanaPublicKey.toString())}
                                    />
                                )}
                                {dynamicWalletAddress &&
                                    dynamicWalletAddress !== address &&
                                    dynamicWalletAddress !== solanaPublicKey?.toString() && (
                                        <CopyableAddress
                                            address={dynamicWalletAddress}
                                            isCopied={copiedAddress === dynamicWalletAddress}
                                            onCopy={() => void handleCopyAny(dynamicWalletAddress)}
                                        />
                                    )}
                            </div>
                        </div>

                        <div className="menu-body">
                            {isConnected && address && (
                                <NeonCard as="div" className="balance">
                                    <div className="label">Ethereum Balance</div>
                                    <NativeBalance type="ethereum" />
                                </NeonCard>
                            )}

                            {solanaConnected && solanaPublicKey && (
                                <NeonCard as="div" className="balance">
                                    <div className="label">Solana Balance</div>
                                    <NativeBalance type="solana" />
                                </NeonCard>
                            )}

                            {popularTokens.length > 0 && (
                                <NeonCard as="div" className="tokens">
                                    <div className="label">Token Balances</div>
                                    <div className="list">
                                        {popularTokens.map((token) => (
                                            <TokenBalance
                                                key={token.address}
                                                symbol={token.symbol}
                                                decimals={token.decimals}
                                                name={token.name}
                                                balance={tokenStatus[token.address.toLowerCase()]?.balance}
                                            />
                                        ))}
                                        {!isTokensLoading &&
                                            fetchedCount === popularTokens.length &&
                                            withBalanceCount === 0 && (
                                                <div className="empty">
                                                    No ERC-20 tokens
                                                </div>
                                            )}
                                    </div>
                                </NeonCard>
                            )}

                            <div className="actions">
                                {!isAuthenticated ? (
                                    <NeonButton
                                        className="action"
                                        onClick={handleSignAndLogin}
                                        disabled={isNonceLoading || isSigning || isVerifying}
                                        tone={Tones.Azure}
                                        size="sm"
                                        fullWidth
                                    >
                                        {isNonceLoading ? 'Getting nonce...' :
                                            isSigning ? 'Please approve the signature in your wallet...' :
                                                isVerifying ? 'Verifying...' : 'Sign Message & Login'}
                                    </NeonButton>
                                ) : (
                                    <NeonButton
                                        className="action"
                                        onClick={handleLogout}
                                        tone={Tones.Cyan}
                                        size="sm"
                                        fullWidth
                                    >
                                        Logout
                                    </NeonButton>
                                )}

                                {(isConnected || user || primaryWallet) && (
                                    <NeonButton
                                        className="action"
                                        onClick={handleDisconnect}
                                        tone={Tones.Amber}
                                        size="sm"
                                        fullWidth
                                    >
                                        Disconnect
                                    </NeonButton>
                                )}

                                {solanaConnected && (
                                    <NeonButton
                                        className="action"
                                        onClick={() => {
                                            solanaDisconnect();
                                            setIsOpen(false);
                                        }}
                                        tone={Tones.Amber}
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
