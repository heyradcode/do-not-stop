import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashRuleset, SOURCE_DEFAULT_RULESET } from '@cryptopets/protocol';

const battleEnv = vi.hoisted(() => ({
    enabled: true,
    deploymentId: 'base-sepolia-live',
    chainIds: ['eip155:84532', 'solana:devnet'],
}));

vi.mock('@config/env', () => ({ env: { battle: battleEnv } }));
vi.mock('@config/prisma', () => ({
    prisma: {
        battleLedger: { findUnique: vi.fn() },
        battleCommitment: { findUnique: vi.fn() },
        battleReceipt: { findUnique: vi.fn() },
        battleRuleset: { findMany: vi.fn(), findUnique: vi.fn() },
    },
}));
vi.mock('@features/battle/signer', () => ({ listSigningKeys: vi.fn() }));

import { getBattleConfig } from '@features/battle/ledger';

beforeEach(() => {
    battleEnv.enabled = true;
    battleEnv.deploymentId = 'base-sepolia-live';
    battleEnv.chainIds = ['eip155:84532', 'solana:devnet'];
});

describe('getBattleConfig', () => {
    it('serves the deployment a client must name in an intent', () => {
        // A client that guessed this would have its intent refused as `wrong-deployment`,
        // after the wallet prompt rather than before it.
        expect(getBattleConfig().deploymentId).toBe('base-sepolia-live');
    });

    it('serves every chain this process accepts intents for', () => {
        expect(getBattleConfig().chainIds).toEqual(['eip155:84532', 'solana:devnet']);
    });

    it('serves the ruleset the accept path actually commits battles under', () => {
        // Not "some published ruleset" — the one `acceptBattle` binds a battle to, since a
        // defence authorization bound to any other is refused as `ruleset-mismatch`.
        expect(getBattleConfig().ruleset).toEqual({
            hash: hashRuleset(SOURCE_DEFAULT_RULESET),
            version: SOURCE_DEFAULT_RULESET.version,
        });
    });

    it('reflects a reconfigured deployment rather than a cached first read', () => {
        battleEnv.deploymentId = 'base-mainnet-live';
        battleEnv.chainIds = ['eip155:8453'];

        expect(getBattleConfig()).toMatchObject({
            deploymentId: 'base-mainnet-live',
            chainIds: ['eip155:8453'],
        });
    });

    it('reports whether this deployment is accepting backend battles', () => {
        // The frontend mode switch reads this. Discovering the answer by submitting an
        // intent and getting a 503 would mean finding out after the wallet prompt.
        expect(getBattleConfig().enabled).toBe(true);

        battleEnv.enabled = false;
        expect(getBattleConfig().enabled).toBe(false);
    });

    it('keeps serving the deployment and ruleset while the mode is off', () => {
        // Reads stay open when writes are refused, so a client can still verify receipts
        // this deployment issued before the mode was switched off.
        battleEnv.enabled = false;
        expect(getBattleConfig()).toMatchObject({ deploymentId: 'base-sepolia-live' });
    });

    it('rejects a chain id the protocol does not recognise', () => {
        // Served config is what clients build signable objects from, so a malformed chain
        // id must fail here rather than become an unsignable intent.
        battleEnv.chainIds = ['not-a-chain-id'];
        expect(() => getBattleConfig()).toThrow();
    });
});
