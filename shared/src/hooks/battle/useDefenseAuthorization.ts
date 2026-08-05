import {
    defenseAuthorizationSolanaMessageBytes,
    defenseAuthorizationTypedData,
    type ChainId,
    type DefenseAuthorization,
} from '@cryptopets/protocol';
import { useCallback, useState } from 'react';
import { useSignTypedData } from 'wagmi';

import { getSolanaAuthSigner } from '../../auth/solanaAuthStore';
import { useApiClient } from '../../contexts/ApiClientContext';
import { normalizeSolanaSignatureToBase58 } from '../../utils/solana/signatureAuthCodec';

import { useActiveChain } from '../session/useActiveChain';
import { useBattleConfig } from './useBattleConfig';

/**
 * Grants and withdraws standing defence consent (§D).
 *
 * Without one of these a pet cannot be challenged at all: `accept` refuses every battle
 * whose defender has no covering authorization. It is signed once and lasts, rather than
 * per battle, because demanding a live signature would restrict play to opponents who
 * happen to be online.
 *
 * What the wallet shows is the full authorization, not a digest, because this is the one
 * prompt where an owner decides who may challenge them, under which rules, and for how
 * long. `@cryptopets/protocol` builds it: EIP-712 for EVM, a labelled message for Solana.
 *
 * Consent is bound to `rulesetHash`, so a balance patch invalidates outstanding grants
 * instead of silently reinterpreting them. Expect to re-grant after one; that is what
 * makes "I agreed to the old rules" not a dispute.
 */

export interface GrantDefenseVars {
    /** Pet ids to cover. Ignored when `allPets` is set. */
    petIds?: string[];
    /** Cover every pet the wallet owns, including ones acquired later. */
    allPets?: boolean;
    /** Inclusive attacker-level band the defender accepts. Defaults to the full range. */
    minLevel?: number;
    maxLevel?: number;
    /** Ceiling on battles per day against this authorization. */
    maxBattlesPerDay?: number;
    /** How long the grant stays valid. */
    days?: number;
}

const DEFAULTS = {
    minLevel: 1,
    maxLevel: 100,
    maxBattlesPerDay: 50,
    days: 30,
} as const;

interface GrantResponse {
    authorizationHash: string;
}

export function useDefenseAuthorization() {
    const apiClient = useApiClient();
    const activeChain = useActiveChain();
    const { data: config } = useBattleConfig();
    const { signTypedDataAsync } = useSignTypedData();

    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const grant = useCallback(
        async (vars: GrantDefenseVars): Promise<string | null> => {
            if (activeChain.kind === 'none') {
                setError(new Error('connect a wallet before granting consent'));
                return null;
            }
            if (!config) {
                // Signing against a guessed ruleset would produce a grant that covers nothing:
                // the hash is part of what is signed, and `accept` matches on it exactly.
                setError(new Error('battle configuration is not loaded yet'));
                return null;
            }
            const allPets = vars.allPets ?? false;
            const petIds = allPets ? [] : (vars.petIds ?? []);
            if (!allPets && petIds.length === 0) {
                setError(new Error('choose at least one pet, or grant for all pets'));
                return null;
            }

            setIsPending(true);
            setError(null);
            try {
                const chainId = chainIdFor(activeChain.kind, config.chainIds);
                const now = Math.floor(Date.now() / 1000);
                const authorization: DefenseAuthorization = {
                    domain: { chainId, deploymentId: config.deploymentId },
                    defenderOwner: activeChain.address,
                    scope: allPets
                        ? { kind: 'allPets' }
                        : { kind: 'pets', petIds: petIds.map((id) => BigInt(id)) },
                    rulesetHash: config.ruleset.hash as `0x${string}`,
                    minLevel: vars.minLevel ?? DEFAULTS.minLevel,
                    maxLevel: vars.maxLevel ?? DEFAULTS.maxLevel,
                    maxBattlesPerDay: vars.maxBattlesPerDay ?? DEFAULTS.maxBattlesPerDay,
                    notBefore: now,
                    expiresAt: now + (vars.days ?? DEFAULTS.days) * 86400,
                    revocationNonce: 0,
                };

                const { signature, signatureFormat } =
                    activeChain.kind === 'evm'
                        ? { signature: await signEvmAuthorization(authorization, signTypedDataAsync), signatureFormat: 'eip712' as const }
                        : { signature: await signSolanaAuthorization(authorization), signatureFormat: 'solana-message' as const };

                const { data } = await apiClient.post<GrantResponse>('/api/battle/authorizations', {
                    authorization: toWire(authorization),
                    signature,
                    signatureFormat,
                });
                return data.authorizationHash;
            } catch (err) {
                setError(err instanceof Error ? err : new Error(String(err)));
                return null;
            } finally {
                setIsPending(false);
            }
        },
        [activeChain, apiClient, config, signTypedDataAsync],
    );

    /**
     * Withdraws every authorization this wallet holds on the active chain.
     *
     * Deliberately unsigned: the failure mode of an unauthorized revocation is fewer
     * battles, never more, and requiring a signature would strand an owner who lost
     * their signing device.
     */
    const revoke = useCallback(async (): Promise<boolean> => {
        if (activeChain.kind === 'none' || !config) {
            setError(new Error('connect a wallet first'));
            return false;
        }
        setIsPending(true);
        setError(null);
        try {
            const chainId = chainIdFor(activeChain.kind, config.chainIds);
            await apiClient.delete(`/api/battle/authorizations?chainId=${encodeURIComponent(chainId)}`);
            return true;
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
            return false;
        } finally {
            setIsPending(false);
        }
    }, [activeChain, apiClient, config]);

    return { grant, revoke, isPending, error };
}

/** Picks the served chain id matching the connected wallet's family. */
function chainIdFor(kind: 'evm' | 'solana', servedChainIds: string[]): ChainId {
    const prefix = kind === 'evm' ? 'eip155:' : 'solana:';
    const match = servedChainIds.find((candidate) => candidate.startsWith(prefix));
    if (!match) {
        throw new Error(`this deployment serves no ${kind} chain (has ${servedChainIds.join(', ') || 'none'})`);
    }
    return match as ChainId;
}

async function signEvmAuthorization(
    authorization: DefenseAuthorization,
    signTypedDataAsync: ReturnType<typeof useSignTypedData>['signTypedDataAsync'],
): Promise<string> {
    const typed = defenseAuthorizationTypedData(authorization);
    return signTypedDataAsync({
        domain: typed.domain,
        types: typed.types,
        primaryType: typed.primaryType,
        // Same narrowing as the intent's: the protocol types accounts as plain `string` so
        // one shape can carry base58 Solana addresses, while wagmi wants EIP-712 `address`
        // fields as `0x${string}`. This branch only runs for EVM, and the protocol builder
        // throws for any other chain family, so these are 0x addresses by now.
        message: typed.message as typeof typed.message & {
            defenderOwner: `0x${string}`;
            rulesetHash: `0x${string}`;
        },
    });
}

async function signSolanaAuthorization(authorization: DefenseAuthorization): Promise<string> {
    const signer = getSolanaAuthSigner();
    if (!signer) {
        throw new Error('no Solana signer is connected');
    }
    const signed = await signer.signMessage(defenseAuthorizationSolanaMessageBytes(authorization));
    return normalizeSolanaSignatureToBase58(signed);
}

/** Serializes an authorization for the wire: bigints become decimal strings, as JSON requires. */
function toWire(authorization: DefenseAuthorization) {
    return {
        chainId: authorization.domain.chainId,
        deploymentId: authorization.domain.deploymentId,
        defenderOwner: authorization.defenderOwner,
        allPets: authorization.scope.kind === 'allPets',
        petIds: authorization.scope.kind === 'pets' ? authorization.scope.petIds.map((id) => id.toString()) : [],
        rulesetHash: authorization.rulesetHash,
        minLevel: authorization.minLevel,
        maxLevel: authorization.maxLevel,
        maxBattlesPerDay: authorization.maxBattlesPerDay,
        notBefore: authorization.notBefore,
        expiresAt: authorization.expiresAt,
        revocationNonce: authorization.revocationNonce,
    };
}
