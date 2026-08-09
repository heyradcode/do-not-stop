import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ethers } from 'ethers';

import { defenseAuthorizationTypedData, hashDefenseAuthorization } from '@cryptopets/protocol';

vi.mock('@config/prisma', () => ({
    prisma: {
        defenseAuthorization: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
        defenseUsage: { updateMany: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    },
}));

vi.mock('@config/env', () => ({
    env: {
        battle: { deploymentId: 'base-sepolia-live', chainIds: ['eip155:84532', 'solana:devnet'] },
    },
}));

import { prisma } from '@config/prisma';
import {
    consumeDailyBudget,
    epochDay,
    findCoveringAuthorization,
    revokeDefenseAuthorizations,
    submitDefenseAuthorization,
    toProtocolAuthorization,
} from '@features/battle/ledger';

const wallet = new ethers.Wallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const DEFENDER = wallet.address.toLowerCase();
const RULESET = `0x${'ab'.repeat(32)}`;
const NOW = 1893456000;

const wire = {
    chainId: 'eip155:84532',
    deploymentId: 'base-sepolia-live',
    defenderOwner: DEFENDER,
    allPets: true,
    petIds: [] as string[],
    rulesetHash: RULESET,
    minLevel: 5,
    maxLevel: 15,
    maxBattlesPerDay: 20,
    notBefore: NOW - 3600,
    expiresAt: NOW + 86400,
    revocationNonce: 0,
};

async function sign(overrides: Partial<typeof wire> = {}): Promise<string> {
    const typed = defenseAuthorizationTypedData(toProtocolAuthorization({ ...wire, ...overrides }));
    return wallet.signTypedData(typed.domain, typed.types as never, typed.message);
}

async function submit(overrides: Partial<typeof wire> = {}, extras: { signature?: string; wallet?: string; now?: number } = {}) {
    return submitDefenseAuthorization({
        authorization: { ...wire, ...overrides },
        signature: extras.signature ?? (await sign(overrides)),
        signatureFormat: 'eip712',
        authenticatedWallet: extras.wallet ?? DEFENDER,
        nowSeconds: extras.now ?? NOW,
    });
}

/** A stored row, as `findCoveringAuthorization` reads it back. */
function row(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        authorizationHash: `0x${'11'.repeat(32)}`,
        chainId: 'eip155:84532',
        deploymentId: 'base-sepolia-live',
        defenderOwner: DEFENDER,
        allPets: true,
        petIds: [],
        rulesetHash: RULESET,
        minLevel: 5,
        maxLevel: 15,
        maxBattlesPerDay: 20,
        notBefore: BigInt(NOW - 3600),
        expiresAt: BigInt(NOW + 86400),
        revocationNonce: 0,
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.defenseAuthorization.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.defenseAuthorization.create).mockResolvedValue({} as never);
});

describe('submitting an authorization', () => {
    it('records it with the signature and scope', async () => {
        const result = await submit();

        expect(result).toEqual({
            ok: true,
            authorizationHash: hashDefenseAuthorization(toProtocolAuthorization(wire)),
        });
        const data = vi.mocked(prisma.defenseAuthorization.create).mock.calls[0]![0].data as Record<string, unknown>;
        expect(data).toMatchObject({
            defenderOwner: DEFENDER,
            allPets: true,
            petIds: [],
            rulesetHash: RULESET,
            minLevel: 5,
            maxLevel: 15,
            maxBattlesPerDay: 20,
            revocationNonce: 0,
        });
        expect(data.expiresAt).toBe(BigInt(wire.expiresAt));
    });

    it('stores an explicit pet scope as strings', async () => {
        await submit({ allPets: false, petIds: ['7', '9'] });
        const data = vi.mocked(prisma.defenseAuthorization.create).mock.calls[0]![0].data as Record<string, unknown>;
        expect(data.allPets).toBe(false);
        expect(data.petIds).toEqual(['7', '9']);
    });

    it('rejects a signature from another wallet', async () => {
        const other = new ethers.Wallet('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
        const typed = defenseAuthorizationTypedData(toProtocolAuthorization(wire));
        const signature = await other.signTypedData(typed.domain, typed.types as never, typed.message);
        expect(await submit({}, { signature })).toMatchObject({ ok: false, reason: 'bad-signature' });
    });

    it('rejects a signature over looser terms than the ones submitted', async () => {
        // Signing a level band of 5-15 must not authorize 1-99.
        const signature = await sign({ minLevel: 1, maxLevel: 99 });
        expect(await submit({}, { signature })).toMatchObject({ ok: false, reason: 'bad-signature' });
    });

    it('rejects a caller consenting on behalf of another wallet', async () => {
        expect(await submit({}, { wallet: '0x2222222222222222222222222222222222222222' })).toMatchObject({
            ok: false,
            reason: 'wallet-mismatch',
        });
    });

    it('rejects another deployment', async () => {
        expect(await submit({ deploymentId: 'base-sepolia-staging' })).toMatchObject({
            ok: false,
            reason: 'wrong-deployment',
        });
    });

    it('rejects an already-expired authorization', async () => {
        // Storing a dead grant would only produce confusing coverage failures later.
        expect(await submit({}, { now: wire.expiresAt })).toMatchObject({ ok: false, reason: 'already-expired' });
    });

    it('rejects a malformed authorization', async () => {
        expect(await submit({ maxBattlesPerDay: 0 }, { signature: '0x00' })).toMatchObject({
            ok: false,
            reason: 'malformed-authorization',
        });
    });

    it('reports a duplicate authorization', async () => {
        vi.mocked(prisma.defenseAuthorization.create).mockRejectedValue(
            Object.assign(new Error('unique'), { code: 'P2002' }),
        );
        expect(await submit()).toMatchObject({ ok: false, reason: 'duplicate-authorization' });
    });
});

describe('revocation nonce monotonicity', () => {
    it('rejects a nonce below the owner current one', async () => {
        // Revocation works by bumping the nonce, so accepting a lower one would reinstate a
        // grant the owner already withdrew.
        vi.mocked(prisma.defenseAuthorization.findFirst).mockResolvedValue({ revocationNonce: 3 } as never);
        expect(await submit({ revocationNonce: 2 })).toMatchObject({ ok: false, reason: 'stale-revocation-nonce' });
    });

    it('accepts the same nonce, so a second grant at the current level is allowed', async () => {
        vi.mocked(prisma.defenseAuthorization.findFirst).mockResolvedValue({ revocationNonce: 3 } as never);
        expect((await submit({ revocationNonce: 3 })).ok).toBe(true);
    });

    it('accepts a higher nonce', async () => {
        vi.mocked(prisma.defenseAuthorization.findFirst).mockResolvedValue({ revocationNonce: 3 } as never);
        expect((await submit({ revocationNonce: 4 })).ok).toBe(true);
    });
});

describe('revokeDefenseAuthorizations', () => {
    it('marks live rows revoked rather than deleting them', async () => {
        // Receipts reference the hash, so a verifier must still see what was consented to.
        vi.mocked(prisma.defenseAuthorization.updateMany).mockResolvedValue({ count: 2 } as never);
        const revokedAt = new Date('2026-07-26T10:00:00.000Z');

        expect(await revokeDefenseAuthorizations('eip155:84532', wallet.address, revokedAt)).toEqual({ revoked: 2 });
        const call = vi.mocked(prisma.defenseAuthorization.updateMany).mock.calls[0]![0];
        expect(call.where).toMatchObject({
            chainId: 'eip155:84532',
            deploymentId: 'base-sepolia-live',
            defenderOwner: DEFENDER,
            revokedAt: null,
        });
        expect(call.data).toEqual({ revokedAt });
    });
});

describe('findCoveringAuthorization', () => {
    const request = {
        chainId: 'eip155:84532',
        defenderOwner: DEFENDER,
        defenderPetId: '2',
        attackerLevel: 10,
        rulesetHash: RULESET,
        nowSeconds: NOW,
    };

    it('returns the authorization covering the battle', async () => {
        vi.mocked(prisma.defenseAuthorization.findMany).mockResolvedValue([row()] as never);
        expect(await findCoveringAuthorization(request)).toEqual({
            ok: true,
            authorizationHash: `0x${'11'.repeat(32)}`,
            maxBattlesPerDay: 20,
        });
    });

    it('only considers live grants for this ruleset', async () => {
        vi.mocked(prisma.defenseAuthorization.findMany).mockResolvedValue([] as never);
        await findCoveringAuthorization(request);
        expect(vi.mocked(prisma.defenseAuthorization.findMany).mock.calls[0]![0]).toMatchObject({
            where: {
                chainId: 'eip155:84532',
                deploymentId: 'base-sepolia-live',
                defenderOwner: DEFENDER,
                revokedAt: null,
                rulesetHash: RULESET,
            },
            orderBy: { createdAt: 'desc' },
        });
    });

    it('reports no-authorization when the defender has none', async () => {
        vi.mocked(prisma.defenseAuthorization.findMany).mockResolvedValue([] as never);
        expect(await findCoveringAuthorization(request)).toMatchObject({ ok: false, reason: 'no-authorization' });
    });

    it('passes through the protocol coverage reason', async () => {
        // Coverage is decided by the same function a third party runs against a receipt, so
        // the operator cannot be more permissive than the published rule.
        vi.mocked(prisma.defenseAuthorization.findMany).mockResolvedValue([row()] as never);
        expect(await findCoveringAuthorization({ ...request, attackerLevel: 3 })).toMatchObject({
            ok: false,
            reason: 'attacker-level-below-band',
        });
        expect(await findCoveringAuthorization({ ...request, attackerLevel: 99 })).toMatchObject({
            ok: false,
            reason: 'attacker-level-above-band',
        });
        expect(await findCoveringAuthorization({ ...request, nowSeconds: NOW + 200000 })).toMatchObject({
            ok: false,
            reason: 'expired',
        });
    });

    it('honours an explicit pet scope', async () => {
        vi.mocked(prisma.defenseAuthorization.findMany).mockResolvedValue([
            row({ allPets: false, petIds: ['7'] }),
        ] as never);
        expect(await findCoveringAuthorization(request)).toMatchObject({ ok: false, reason: 'pet-not-covered' });
        expect((await findCoveringAuthorization({ ...request, defenderPetId: '7' })).ok).toBe(true);
    });

    it('prefers the most recently signed grant when several could apply', async () => {
        // A player who tightens their terms expects the new terms to apply; picking the most
        // permissive would make tightening them pointless.
        vi.mocked(prisma.defenseAuthorization.findMany).mockResolvedValue([
            row({ authorizationHash: `0x${'22'.repeat(32)}`, minLevel: 9, maxLevel: 11 }),
            row({ authorizationHash: `0x${'33'.repeat(32)}`, minLevel: 1, maxLevel: 99 }),
        ] as never);
        expect(await findCoveringAuthorization(request)).toMatchObject({
            ok: true,
            authorizationHash: `0x${'22'.repeat(32)}`,
        });
    });

    it('falls through to a later grant when the newest does not cover', async () => {
        vi.mocked(prisma.defenseAuthorization.findMany).mockResolvedValue([
            row({ authorizationHash: `0x${'22'.repeat(32)}`, minLevel: 20, maxLevel: 30 }),
            row({ authorizationHash: `0x${'33'.repeat(32)}`, minLevel: 1, maxLevel: 99 }),
        ] as never);
        expect(await findCoveringAuthorization(request)).toMatchObject({
            ok: true,
            authorizationHash: `0x${'33'.repeat(32)}`,
        });
    });
});

describe('epochDay', () => {
    it('buckets by UTC day, with no timezone in sight', () => {
        expect(epochDay(0)).toBe(0);
        expect(epochDay(86399)).toBe(0);
        expect(epochDay(86400)).toBe(1);
        expect(epochDay(NOW)).toBe(Math.floor(NOW / 86400));
    });
});

describe('consumeDailyBudget', () => {
    it('increments an existing row under the cap', async () => {
        vi.mocked(prisma.defenseUsage.updateMany).mockResolvedValue({ count: 1 } as never);
        vi.mocked(prisma.defenseUsage.findUnique).mockResolvedValue({ count: 4 } as never);

        expect(await consumeDailyBudget('0xabc', 20, NOW)).toEqual({ ok: true, used: 4 });
        // The cap lives in the WHERE clause, so two concurrent battles cannot both read
        // "one left" and both take it.
        expect(vi.mocked(prisma.defenseUsage.updateMany).mock.calls[0]![0].where).toMatchObject({
            authorizationHash: '0xabc',
            dayBucket: epochDay(NOW),
            count: { lt: 20 },
        });
    });

    it('creates today row on the first battle of the day', async () => {
        vi.mocked(prisma.defenseUsage.updateMany).mockResolvedValue({ count: 0 } as never);
        vi.mocked(prisma.defenseUsage.create).mockResolvedValue({} as never);

        expect(await consumeDailyBudget('0xabc', 20, NOW)).toEqual({ ok: true, used: 1 });
    });

    it('retries the guarded update when another request created the row first', async () => {
        vi.mocked(prisma.defenseUsage.updateMany)
            .mockResolvedValueOnce({ count: 0 } as never)
            .mockResolvedValueOnce({ count: 1 } as never);
        vi.mocked(prisma.defenseUsage.create).mockRejectedValue(
            Object.assign(new Error('unique'), { code: 'P2002' }),
        );
        vi.mocked(prisma.defenseUsage.findUnique).mockResolvedValue({ count: 2 } as never);

        expect(await consumeDailyBudget('0xabc', 20, NOW)).toEqual({ ok: true, used: 2 });
        expect(prisma.defenseUsage.updateMany).toHaveBeenCalledTimes(2);
    });

    it('refuses once the cap is reached', async () => {
        vi.mocked(prisma.defenseUsage.updateMany).mockResolvedValue({ count: 0 } as never);
        vi.mocked(prisma.defenseUsage.create).mockRejectedValue(
            Object.assign(new Error('unique'), { code: 'P2002' }),
        );

        expect(await consumeDailyBudget('0xabc', 20, NOW)).toEqual({ ok: false, reason: 'daily-cap-reached' });
    });

    it('rethrows an unexpected database error', async () => {
        vi.mocked(prisma.defenseUsage.updateMany).mockResolvedValue({ count: 0 } as never);
        vi.mocked(prisma.defenseUsage.create).mockRejectedValue(new Error('connection reset'));
        await expect(consumeDailyBudget('0xabc', 20, NOW)).rejects.toThrow(/connection reset/);
    });
});
