import { chainFamily, evmChainIdNumber } from '../domain/chainId';
import { currentSchemaVersion } from '../domain/schemaVersions';
import { utf8ToBytes } from '../encoding/bytes';

import { assertSessionDelegation, type SessionDelegation } from './types';

/**
 * The payload a wallet signs to delegate battle signing.
 *
 * Every field named, like the intent's and the authorization's, and here the reason is at
 * its sharpest: this is the prompt where someone hands a key they will never see again the
 * ability to act for them. A digest would tell them nothing about what they are approving,
 * and this is precisely the approval that should not be given blindly.
 *
 * `scope` is in the signed payload rather than implied by the message header, so widening
 * what a session key may do cannot be done without the owner having agreed to the wider
 * text.
 */

export const EIP712_SESSION_DOMAIN_NAME = 'CryptoPets Session';
export const EIP712_SESSION_DOMAIN_VERSION = '1';

export const EIP712_SESSION_TYPES = {
    SessionDelegation: [
        { name: 'schemaVersion', type: 'uint16' },
        { name: 'chainId', type: 'string' },
        { name: 'deploymentId', type: 'string' },
        { name: 'owner', type: 'address' },
        { name: 'sessionKey', type: 'address' },
        { name: 'scope', type: 'string' },
        { name: 'notBefore', type: 'uint64' },
        { name: 'expiresAt', type: 'uint64' },
        { name: 'revocationNonce', type: 'uint32' },
    ],
} as const;

export interface SessionDelegationTypedData {
    domain: { name: string; version: string; chainId: number };
    types: typeof EIP712_SESSION_TYPES;
    primaryType: 'SessionDelegation';
    message: {
        schemaVersion: number;
        chainId: string;
        deploymentId: string;
        owner: string;
        sessionKey: string;
        scope: string;
        notBefore: bigint;
        expiresAt: bigint;
        revocationNonce: number;
    };
}

/** EIP-712 typed data for an EVM delegation. */
export function sessionDelegationTypedData(delegation: SessionDelegation): SessionDelegationTypedData {
    const checked = assertSessionDelegation(delegation);
    if (chainFamily(checked.domain.chainId) !== 'evm') {
        throw new Error(`EIP-712 typed data is for EVM delegations; got ${checked.domain.chainId}`);
    }
    return {
        domain: {
            name: EIP712_SESSION_DOMAIN_NAME,
            version: EIP712_SESSION_DOMAIN_VERSION,
            chainId: evmChainIdNumber(checked.domain.chainId),
        },
        types: EIP712_SESSION_TYPES,
        primaryType: 'SessionDelegation',
        message: {
            schemaVersion: currentSchemaVersion('sessionDelegation'),
            chainId: checked.domain.chainId,
            deploymentId: checked.domain.deploymentId,
            owner: checked.owner,
            sessionKey: checked.sessionKey,
            scope: checked.scope,
            notBefore: BigInt(checked.notBefore),
            expiresAt: BigInt(checked.expiresAt),
            revocationNonce: checked.revocationNonce,
        },
    };
}

export const SOLANA_SESSION_MESSAGE_HEADER = 'CryptoPets Session Delegation v1';

/** Labelled text message for a Solana delegation. */
export function sessionDelegationSolanaMessage(delegation: SessionDelegation): string {
    const checked = assertSessionDelegation(delegation);
    if (chainFamily(checked.domain.chainId) !== 'solana') {
        throw new Error(`Solana sign-message is for Solana delegations; got ${checked.domain.chainId}`);
    }
    return [
        SOLANA_SESSION_MESSAGE_HEADER,
        `schema: ${currentSchemaVersion('sessionDelegation')}`,
        `chain: ${checked.domain.chainId}`,
        `deployment: ${checked.domain.deploymentId}`,
        `owner: ${checked.owner}`,
        `sessionKey: ${checked.sessionKey}`,
        `scope: ${checked.scope}`,
        `notBefore: ${checked.notBefore}`,
        `expires: ${checked.expiresAt}`,
        `revocationNonce: ${checked.revocationNonce}`,
    ].join('\n');
}

export function sessionDelegationSolanaMessageBytes(delegation: SessionDelegation): Uint8Array {
    return utf8ToBytes(sessionDelegationSolanaMessage(delegation));
}
