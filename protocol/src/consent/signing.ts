import { chainFamily, evmChainIdNumber } from '../domain/chainId';
import { currentSchemaVersion } from '../domain/schemaVersions';
import { utf8ToBytes } from '../encoding/bytes';

import { assertDefenseAuthorization, type DefenseAuthorization } from './types';

/**
 * Payloads the defender's wallet signs. Same reasoning as the intent's: every
 * field is named, because this is the one prompt where the owner decides who may
 * challenge them, under which rules, and for how long. A hash would tell them
 * none of that.
 */

export const EIP712_DEFENSE_DOMAIN_NAME = 'CryptoPets Defense';
export const EIP712_DEFENSE_DOMAIN_VERSION = '1';

export const EIP712_DEFENSE_TYPES = {
    DefenseAuthorization: [
        { name: 'schemaVersion', type: 'uint16' },
        { name: 'chainId', type: 'string' },
        { name: 'deploymentId', type: 'string' },
        { name: 'defenderOwner', type: 'address' },
        { name: 'allPets', type: 'bool' },
        { name: 'petIds', type: 'uint256[]' },
        { name: 'rulesetHash', type: 'bytes32' },
        { name: 'minLevel', type: 'uint16' },
        { name: 'maxLevel', type: 'uint16' },
        { name: 'maxBattlesPerDay', type: 'uint32' },
        { name: 'notBefore', type: 'uint64' },
        { name: 'expiresAt', type: 'uint64' },
        { name: 'revocationNonce', type: 'uint32' },
    ],
} as const;

export interface DefenseAuthorizationTypedData {
    domain: {
        name: string;
        version: string;
        chainId: number;
    };
    types: typeof EIP712_DEFENSE_TYPES;
    primaryType: 'DefenseAuthorization';
    message: {
        schemaVersion: number;
        chainId: string;
        deploymentId: string;
        defenderOwner: string;
        allPets: boolean;
        petIds: readonly bigint[];
        rulesetHash: string;
        minLevel: number;
        maxLevel: number;
        maxBattlesPerDay: number;
        notBefore: bigint;
        expiresAt: bigint;
        revocationNonce: number;
    };
}

/** EIP-712 typed data for an EVM authorization. */
export function defenseAuthorizationTypedData(auth: DefenseAuthorization): DefenseAuthorizationTypedData {
    const checked = assertDefenseAuthorization(auth);
    if (chainFamily(checked.domain.chainId) !== 'evm') {
        throw new Error(`EIP-712 typed data is for EVM authorizations; got ${checked.domain.chainId}`);
    }
    return {
        domain: {
            name: EIP712_DEFENSE_DOMAIN_NAME,
            version: EIP712_DEFENSE_DOMAIN_VERSION,
            chainId: evmChainIdNumber(checked.domain.chainId),
        },
        types: EIP712_DEFENSE_TYPES,
        primaryType: 'DefenseAuthorization',
        message: {
            schemaVersion: currentSchemaVersion('defenseAuthorization'),
            chainId: checked.domain.chainId,
            deploymentId: checked.domain.deploymentId,
            defenderOwner: checked.defenderOwner,
            allPets: checked.scope.kind === 'allPets',
            petIds: checked.scope.kind === 'pets' ? checked.scope.petIds : [],
            rulesetHash: checked.rulesetHash,
            minLevel: checked.minLevel,
            maxLevel: checked.maxLevel,
            maxBattlesPerDay: checked.maxBattlesPerDay,
            notBefore: BigInt(checked.notBefore),
            expiresAt: BigInt(checked.expiresAt),
            revocationNonce: checked.revocationNonce,
        },
    };
}

/** First line of the Solana message, and its domain separator. */
export const SOLANA_DEFENSE_MESSAGE_HEADER = 'CryptoPets Defense Authorization v1';

/**
 * Labelled text message for a Solana authorization.
 *
 * `pets: (all)` cannot be confused with an explicit list: pet ids render as
 * digits, and parentheses cannot appear in one.
 */
export function defenseAuthorizationSolanaMessage(auth: DefenseAuthorization): string {
    const checked = assertDefenseAuthorization(auth);
    if (chainFamily(checked.domain.chainId) !== 'solana') {
        throw new Error(`Solana sign-message is for Solana authorizations; got ${checked.domain.chainId}`);
    }
    const pets = checked.scope.kind === 'allPets' ? '(all)' : checked.scope.petIds.join(',');
    return [
        SOLANA_DEFENSE_MESSAGE_HEADER,
        `schema: ${currentSchemaVersion('defenseAuthorization')}`,
        `chain: ${checked.domain.chainId}`,
        `deployment: ${checked.domain.deploymentId}`,
        `defender: ${checked.defenderOwner}`,
        `pets: ${pets}`,
        `ruleset: ${checked.rulesetHash}`,
        `levels: ${checked.minLevel}-${checked.maxLevel}`,
        `maxBattlesPerDay: ${checked.maxBattlesPerDay}`,
        `notBefore: ${checked.notBefore}`,
        `expires: ${checked.expiresAt}`,
        `revocationNonce: ${checked.revocationNonce}`,
    ].join('\n');
}

/** The Solana message as the bytes a wallet signs. */
export function defenseAuthorizationSolanaMessageBytes(auth: DefenseAuthorization): Uint8Array {
    return utf8ToBytes(defenseAuthorizationSolanaMessage(auth));
}
