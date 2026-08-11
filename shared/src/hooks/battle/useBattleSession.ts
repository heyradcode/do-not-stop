import { useCallback, useState } from 'react';
import { useSignTypedData } from 'wagmi';

import {
    MAX_SESSION_SECONDS,
    type SessionDelegation,
    sessionDelegationTypedData,
} from '@cryptopets/protocol';
import { Wallet } from 'ethers';

import { useApiClient } from '../../contexts/ApiClientContext';
import {
    clearSessionKey,
    createSessionKey,
    loadSessionKey,
    saveSessionKey,
    type StoredSessionKey,
} from '../../auth/sessionKeyStore';

import { useActiveChain } from '../session/useActiveChain';
import { tryChainIdFor } from './chainIdFor';
import { useBattleConfig } from './useBattleConfig';

/**
 * Approving a client-held key to sign battle intents, so the wallet prompt stops being
 * per battle (§D).
 *
 * §D's rule is unchanged and this depends on it: a battle is authorized by a wallet
 * signature, never by a JWT, because a JWT is a bearer token the operator issues to itself.
 * The delegated key is generated in the browser and never sent anywhere, so the operator
 * still cannot produce an intent. Only the number of prompts changes.
 *
 * EVM only, and deliberately explicit about it. Delegation needs the client to hold a
 * signing key of the right family, and the Solana signer here is the wallet adapter rather
 * than a keypair this code owns. A Solana player keeps the per-battle prompt, which is the
 * behaviour that already worked, rather than a half-built path that fails at signing time.
 */

/** Requested window. The protocol caps it at `MAX_SESSION_SECONDS`, so this cannot exceed it. */
const SESSION_SECONDS = MAX_SESSION_SECONDS;

export interface BattleSession {
    /** Signs an intent's typed data, or null when there is no usable session. */
    key: StoredSessionKey | null;
    /** Whether this chain can delegate at all. False on Solana. */
    supported: boolean;
    isPending: boolean;
    error: Error | null;
    /** Prompts the wallet once and stores the approved key. Returns it, or null. */
    approve(): Promise<StoredSessionKey | null>;
    /** Drops the local key and tells the server to revoke every delegation for this wallet. */
    revoke(): Promise<void>;
    /**
     * Drops the local key without calling the server.
     *
     * For the one case where the server has already said the key is dead
     * (`session-not-authorized`): revoking it there would ask the server to retract a
     * delegation it has just told us it does not honour, and a failure in that call would
     * leave the dead key in storage to be reused on the next battle, and the next.
     */
    discardLocalKey(): void;
}

export function useBattleSession(): BattleSession {
    const apiClient = useApiClient();
    const activeChain = useActiveChain();
    const { data: config } = useBattleConfig();
    const { signTypedDataAsync } = useSignTypedData();

    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    // Bumped after approve/revoke purely to force a re-render, which re-reads storage
    // below. The key itself is never held in React state: sessionStorage is the single
    // source, and mirroring it would give two answers the moment it was cleared elsewhere.
    const [, setRevision] = useState(0);

    const supported = activeChain.kind === 'evm';
    const chainId = activeChain.kind === 'none' || !config ? null : tryChainIdFor(activeChain.kind, config.chainIds);
    const owner = activeChain.kind === 'none' ? null : activeChain.address;

    // Read on every render rather than cached, so an expiry that passes while the tab is
    // open takes effect at the next render instead of at the next reload.
    const key =
        supported && chainId && owner ? loadSessionKey(owner, chainId, Math.floor(Date.now() / 1000)) : null;

    const approve = useCallback(async (): Promise<StoredSessionKey | null> => {
        if (!supported || !chainId || !owner || !config) {
            setError(new Error('this chain does not support battle sessions'));
            return null;
        }

        setIsPending(true);
        setError(null);
        try {
            const fresh = createSessionKey();
            const now = Math.floor(Date.now() / 1000);
            const delegation: SessionDelegation = {
                domain: { chainId, deploymentId: config.deploymentId },
                owner,
                sessionKey: fresh.address,
                scope: 'battle-intent',
                notBefore: now,
                expiresAt: now + SESSION_SECONDS,
                revocationNonce: 0,
            };

            const typed = sessionDelegationTypedData(delegation);
            const signature = await signTypedDataAsync({
                domain: typed.domain,
                types: typed.types,
                primaryType: typed.primaryType,
                // Same narrowing the intent and the authorization make: the protocol types
                // accounts as plain `string` so one shape carries base58 Solana addresses,
                // and this branch only runs for EVM.
                message: typed.message as typeof typed.message & {
                    owner: `0x${string}`;
                    sessionKey: `0x${string}`;
                },
            });

            await apiClient.post('/api/battle/sessions', {
                delegation: {
                    chainId,
                    deploymentId: config.deploymentId,
                    owner,
                    sessionKey: fresh.address,
                    scope: 'battle-intent',
                    notBefore: delegation.notBefore,
                    expiresAt: delegation.expiresAt,
                    revocationNonce: 0,
                },
                signature,
                signatureFormat: 'eip712',
            });

            // Stored only after the server accepted it. A key kept for a delegation that
            // was refused would sign intents that are rejected one at a time, forever.
            const stored: StoredSessionKey = {
                privateKey: fresh.privateKey,
                address: fresh.address,
                owner,
                chainId,
                expiresAt: delegation.expiresAt,
            };
            saveSessionKey(stored);
            setRevision((n) => n + 1);
            return stored;
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
            return null;
        } finally {
            setIsPending(false);
        }
    }, [apiClient, chainId, config, owner, signTypedDataAsync, supported]);

    const discardLocalKey = useCallback((): void => {
        clearSessionKey();
        setRevision((n) => n + 1);
    }, []);

    const revoke = useCallback(async (): Promise<void> => {
        clearSessionKey();
        setRevision((n) => n + 1);
        if (chainId) {
            // Local first, server second: the local key is what would keep signing, and a
            // failed request must not leave it sitting there because the call threw.
            await apiClient.delete(`/api/battle/sessions?chainId=${encodeURIComponent(chainId)}`);
        }
    }, [apiClient, chainId]);

    return { key, supported, isPending, error, approve, revoke, discardLocalKey };
}

/**
 * Signs an intent's typed data with a stored session key.
 *
 * Separate from the hook because it runs inside the submit path rather than during render,
 * and because it is the one place the private key is used: keeping it in a single named
 * function makes that easy to audit.
 */
export async function signIntentWithSession(
    key: StoredSessionKey,
    typed: { domain: unknown; types: unknown; message: Record<string, unknown> },
): Promise<string> {
    const wallet = new Wallet(key.privateKey);
    return wallet.signTypedData(
        typed.domain as never,
        typed.types as never,
        typed.message as never,
    );
}
