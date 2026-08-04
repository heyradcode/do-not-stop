import { describe, expect, it } from 'vitest';

import {
    type DefenseAuthorization,
    defenseAuthorizationSolanaMessage,
    defenseAuthorizationSolanaMessageBytes,
    defenseAuthorizationTypedData,
    SOLANA_DEFENSE_MESSAGE_HEADER,
} from '../../src/consent';
import type { Hex } from '../../src/encoding/bytes';

const RULESET = `0x${'ab'.repeat(32)}` as Hex;

const EVM: DefenseAuthorization = {
    domain: { chainId: 'eip155:84532', deploymentId: 'base-sepolia-live' },
    defenderOwner: '0xabcdef0123456789abcdef0123456789abcdef01',
    scope: { kind: 'allPets' },
    rulesetHash: RULESET,
    minLevel: 5,
    maxLevel: 15,
    maxBattlesPerDay: 20,
    notBefore: 1861920000,
    expiresAt: 1893456000,
    revocationNonce: 0,
};

const SOLANA: DefenseAuthorization = {
    ...EVM,
    domain: { chainId: 'solana:devnet', deploymentId: 'local-dev' },
    defenderOwner: 'GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp',
};

describe('defenseAuthorizationTypedData', () => {
    it('carries the numeric chain id in the domain and the protocol ids in the message', () => {
        const typed = defenseAuthorizationTypedData(EVM);
        expect(typed.domain).toEqual({ name: 'CryptoPets Defense', version: '1', chainId: 84532 });
        expect(typed.message.chainId).toBe('eip155:84532');
        expect(typed.message.deploymentId).toBe('base-sepolia-live');
    });

    it('names every field the owner is approving', () => {
        const typed = defenseAuthorizationTypedData(EVM);
        const fields = typed.types.DefenseAuthorization.map((f) => f.name);
        expect(fields).toEqual([
            'schemaVersion',
            'chainId',
            'deploymentId',
            'defenderOwner',
            'allPets',
            'petIds',
            'rulesetHash',
            'minLevel',
            'maxLevel',
            'maxBattlesPerDay',
            'notBefore',
            'expiresAt',
            'revocationNonce',
        ]);
        expect(Object.keys(typed.message).sort()).toEqual([...fields].sort());
    });

    it('renders a blanket scope as allPets with an empty list', () => {
        const typed = defenseAuthorizationTypedData(EVM);
        expect(typed.message.allPets).toBe(true);
        expect(typed.message.petIds).toEqual([]);
    });

    it('renders an explicit scope as the list with allPets false', () => {
        const typed = defenseAuthorizationTypedData({ ...EVM, scope: { kind: 'pets', petIds: [7n, 9n] } });
        expect(typed.message.allPets).toBe(false);
        expect(typed.message.petIds).toEqual([7n, 9n]);
    });

    it('refuses a Solana authorization', () => {
        expect(() => defenseAuthorizationTypedData(SOLANA)).toThrow(/EIP-712 typed data is for EVM authorizations/);
    });
});

describe('defenseAuthorizationSolanaMessage', () => {
    it('renders labelled lines under a domain-separating header', () => {
        expect(defenseAuthorizationSolanaMessage(SOLANA)).toBe(
            [
                'CryptoPets Defense Authorization v1',
                'schema: 1',
                'chain: solana:devnet',
                'deployment: local-dev',
                'defender: GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp',
                'pets: (all)',
                `ruleset: ${RULESET}`,
                'levels: 5-15',
                'maxBattlesPerDay: 20',
                'notBefore: 1861920000',
                'expires: 1893456000',
                'revocationNonce: 0',
            ].join('\n'),
        );
    });

    it('lists explicit pet ids', () => {
        const message = defenseAuthorizationSolanaMessage({
            ...SOLANA,
            scope: { kind: 'pets', petIds: [3n, 4n] },
        });
        expect(message).toContain('pets: 3,4');
        expect(message).not.toContain('(all)');
    });

    it('starts with the header, so the signature cannot be reused for an intent', () => {
        expect(defenseAuthorizationSolanaMessage(SOLANA).startsWith(SOLANA_DEFENSE_MESSAGE_HEADER)).toBe(true);
        expect(SOLANA_DEFENSE_MESSAGE_HEADER).not.toBe('CryptoPets Battle Intent v1');
    });

    it('changes when any bound changes', () => {
        const base = defenseAuthorizationSolanaMessage(SOLANA);
        expect(defenseAuthorizationSolanaMessage({ ...SOLANA, maxLevel: 16 })).not.toBe(base);
        expect(defenseAuthorizationSolanaMessage({ ...SOLANA, maxBattlesPerDay: 21 })).not.toBe(base);
        expect(defenseAuthorizationSolanaMessage({ ...SOLANA, revocationNonce: 1 })).not.toBe(base);
    });

    it('encodes to UTF-8 bytes for the wallet', () => {
        const bytes = defenseAuthorizationSolanaMessageBytes(SOLANA);
        expect(new TextDecoder().decode(bytes)).toBe(defenseAuthorizationSolanaMessage(SOLANA));
    });

    it('refuses an EVM authorization', () => {
        expect(() => defenseAuthorizationSolanaMessage(EVM)).toThrow(/Solana sign-message is for Solana/);
    });
});
