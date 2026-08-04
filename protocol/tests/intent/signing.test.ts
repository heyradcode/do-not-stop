import { describe, expect, it } from 'vitest';

import {
    battleIntentSolanaMessage,
    battleIntentSolanaMessageBytes,
    type BattleIntent,
    battleIntentTypedData,
    SOLANA_INTENT_MESSAGE_HEADER,
} from '../../src/intent';

const EVM: BattleIntent = {
    domain: { chainId: 'eip155:84532', deploymentId: 'base-sepolia-live' },
    attackerOwner: '0xabcdef0123456789abcdef0123456789abcdef01',
    attackerPetId: 1n,
    defenderOwner: '0x2222222222222222222222222222222222222222',
    defenderPetId: 2n,
    challengeId: null,
    clientNonce: '01hq8z0000000000000000',
    rulesetHash: `0x${'ab'.repeat(32)}`,
    expiresAt: 1893456000,
};

const SOLANA: BattleIntent = {
    ...EVM,
    domain: { chainId: 'solana:devnet', deploymentId: 'local-dev' },
    attackerOwner: 'DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6aK3TzhBd8ZUqzTqL',
    defenderOwner: 'GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp',
};

describe('battleIntentTypedData', () => {
    it('puts the numeric chain id in the EIP-712 domain and the protocol ids in the message', () => {
        const typed = battleIntentTypedData(EVM);
        expect(typed.domain).toEqual({ name: 'CryptoPets Battle', version: '1', chainId: 84532 });
        // Both are needed: the domain lets a wallet warn about a network mismatch,
        // the message fields stop a replay onto another deployment of the same chain.
        expect(typed.message.chainId).toBe('eip155:84532');
        expect(typed.message.deploymentId).toBe('base-sepolia-live');
    });

    it('names every field it asks the owner to approve, rather than one opaque digest', () => {
        const typed = battleIntentTypedData(EVM);
        const fields = typed.types.BattleIntent.map((f) => f.name);
        expect(fields).toEqual([
            'schemaVersion',
            'chainId',
            'deploymentId',
            'attackerOwner',
            'attackerPetId',
            'defenderOwner',
            'defenderPetId',
            'challengeId',
            'clientNonce',
            'rulesetHash',
            'expiresAt',
        ]);
        expect(Object.keys(typed.message).sort()).toEqual([...fields].sort());
    });

    it('normalizes the owner and keeps ids as bigint for the signer', () => {
        const typed = battleIntentTypedData({
            ...EVM,
            attackerOwner: '0xABCDEF0123456789abcdef0123456789ABCDEF01',
        });
        expect(typed.message.attackerOwner).toBe('0xabcdef0123456789abcdef0123456789abcdef01');
        expect(typed.message.attackerPetId).toBe(1n);
        expect(typed.message.expiresAt).toBe(1893456000n);
    });

    it('maps an absent challenge to an empty string, which validation forbids as a real value', () => {
        expect(battleIntentTypedData(EVM).message.challengeId).toBe('');
        expect(battleIntentTypedData({ ...EVM, challengeId: 'abc' }).message.challengeId).toBe('abc');
    });

    it('refuses a Solana intent', () => {
        expect(() => battleIntentTypedData(SOLANA)).toThrow(/EIP-712 typed data is for EVM intents/);
    });
});

describe('battleIntentSolanaMessage', () => {
    it('renders labelled lines under a domain-separating header', () => {
        expect(battleIntentSolanaMessage(SOLANA)).toBe(
            [
                'CryptoPets Battle Intent v1',
                'schema: 1',
                'chain: solana:devnet',
                'deployment: local-dev',
                'attacker: DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6aK3TzhBd8ZUqzTqL',
                'attackerPet: 1',
                'defender: GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp',
                'defenderPet: 2',
                'challenge: (none)',
                'nonce: 01hq8z0000000000000000',
                `ruleset: 0x${'ab'.repeat(32)}`,
                'expires: 1893456000',
            ].join('\n'),
        );
    });

    it('starts with the header, so a signature cannot be reused for another message type', () => {
        expect(battleIntentSolanaMessage(SOLANA).startsWith(SOLANA_INTENT_MESSAGE_HEADER)).toBe(true);
    });

    it('cannot confuse an absent challenge with a real id', () => {
        // `(none)` is outside the allowed id charset, so no real challenge can
        // render the same line as an absent one.
        expect(() => battleIntentSolanaMessage({ ...SOLANA, challengeId: '(none)' })).toThrow(/challengeId/);
    });

    it('changes when any field changes', () => {
        const base = battleIntentSolanaMessage(SOLANA);
        expect(battleIntentSolanaMessage({ ...SOLANA, defenderPetId: 3n })).not.toBe(base);
        expect(battleIntentSolanaMessage({ ...SOLANA, expiresAt: SOLANA.expiresAt + 1 })).not.toBe(base);
    });

    it('encodes to UTF-8 bytes for the wallet', () => {
        const bytes = battleIntentSolanaMessageBytes(SOLANA);
        expect(new TextDecoder().decode(bytes)).toBe(battleIntentSolanaMessage(SOLANA));
    });

    it('refuses an EVM intent', () => {
        expect(() => battleIntentSolanaMessage(EVM)).toThrow(/Solana sign-message is for Solana intents/);
    });
});
