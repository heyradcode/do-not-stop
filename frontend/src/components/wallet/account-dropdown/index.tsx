import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useWallet } from '@solana/wallet-adapter-react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { useAuth } from '@shared/core';
import { useAccountTokenBalances } from '@hooks/useAccountTokenBalances';
import { Tones } from '@constants/tones';
import { NeonButton, NeonCard } from '@components/ui';
import Icon, { CheckIcon, CopyIcon } from '@components/ui/icon';
import {
    EthereumNetworkSwitcher,
    SolanaNetworkSwitcher,
} from '@components/wallet/network-switcher';
import TokenBalance from '@components/wallet/token-balance';
import NativeBalance from '@components/wallet/native-balance';
import clsx from 'clsx';
import styles from './index.module.css';

interface CopyableAddressProps {
    address: string;
    isCopied: boolean;
    onCopy: () => void;
}

const CopyableAddress: React.FC<CopyableAddressProps> = ({ address, isCopied, onCopy }) => (
    <div
        className={clsx(styles.address, isCopied && styles.copied)}
        role="button"
        tabIndex={0}
        onClick={onCopy}
        onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onCopy();
            }
        }}
        title={isCopied ? 'Address copied!' : 'Click to copy address'}
    >
        <span className={styles.addressText}>{address}</span>
        <span className={styles.copyIcon}>
            <Icon
                as={isCopied ? CheckIcon : CopyIcon}
                tone={isCopied ? Tones.Emerald : Tones.Cyan}
                glow="none"
                noGap
            />
        </span>
    </div>
);

const AccountDropdown: React.FC = () => {
    const { address, isConnected, chain } = useAccount();
    const {
        publicKey: solanaPublicKey,
        connected: solanaConnected,
        disconnect: solanaDisconnect,
    } = useWallet();
    const { setShowAuthFlow, handleLogOut, user, primaryWallet } = useDynamicContext();
    const [isOpen, setIsOpen] = useState(false);
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

    const dropdownRef = useRef<HTMLDivElement>(null);

    const { isAuthenticated, logout, signAndLogin, isSigning, isVerifying, isNonceLoading } =
        useAuth();

    // ERC-20 balances (single typed multicall, react-query cached), fetched only
    // while the dropdown is open and an EVM wallet is connected.
    const { popularTokens, tokenBalances, allFetched, withBalanceCount } = useAccountTokenBalances(
        chain?.id,
        address,
        isOpen,
    );

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
        const handleClickOutside = (event: globalThis.MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as globalThis.Node)
            ) {
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
                <NeonButton
                    tone={Tones.Azure}
                    className={styles.connectBtn}
                    onClick={() => setShowAuthFlow(true)}
                >
                    Connect Wallet
                </NeonButton>
            </div>
        );
    }

    return (
        <div className="account-dropdown">
            {isConnected && <EthereumNetworkSwitcher />}
            {solanaConnected && <SolanaNetworkSwitcher />}
            <div className={styles.dropdown} ref={dropdownRef}>
                <NeonButton
                    className={styles.trigger}
                    onClick={() => setIsOpen(!isOpen)}
                    tone={Tones.Azure}
                    size="sm"
                >
                    {headerTriggerLabel} {isOpen ? '▲' : '▼'}
                </NeonButton>

                {isOpen && (
                    <NeonCard as="section" className={styles.menu}>
                        <div className={styles.menuHeader}>
                            <div className={styles.addresses}>
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
                                        onCopy={() =>
                                            void handleCopyAny(solanaPublicKey.toString())
                                        }
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

                        <div className={styles.menuBody}>
                            {isConnected && address && (
                                <NeonCard as="div" className={styles.balance}>
                                    <div className={styles.label}>Ethereum Balance</div>
                                    <NativeBalance type="ethereum" />
                                </NeonCard>
                            )}

                            {solanaConnected && solanaPublicKey && (
                                <NeonCard as="div" className={styles.balance}>
                                    <div className={styles.label}>Solana Balance</div>
                                    <NativeBalance type="solana" />
                                </NeonCard>
                            )}

                            {popularTokens.length > 0 && (
                                <NeonCard as="div" className={styles.tokens}>
                                    <div className={styles.label}>Token Balances</div>
                                    <div className={styles.list}>
                                        {tokenBalances.map(({ token, balance }) => (
                                            <TokenBalance
                                                key={token.address}
                                                symbol={token.symbol}
                                                decimals={token.decimals}
                                                name={token.name}
                                                balance={balance}
                                            />
                                        ))}
                                        {allFetched && withBalanceCount === 0 && (
                                            <div className={styles.empty}>No ERC-20 tokens</div>
                                        )}
                                    </div>
                                </NeonCard>
                            )}

                            <div className={styles.actions}>
                                {!isAuthenticated ? (
                                    <NeonButton
                                        className={styles.action}
                                        onClick={handleSignAndLogin}
                                        disabled={isNonceLoading || isSigning || isVerifying}
                                        tone={Tones.Azure}
                                        size="sm"
                                        fullWidth
                                    >
                                        {isNonceLoading
                                            ? 'Getting nonce...'
                                            : isSigning
                                            ? 'Please approve the signature in your wallet...'
                                            : isVerifying
                                            ? 'Verifying...'
                                            : 'Sign Message & Login'}
                                    </NeonButton>
                                ) : (
                                    <NeonButton
                                        className={styles.action}
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
                                        className={styles.action}
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
                                        className={styles.action}
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
