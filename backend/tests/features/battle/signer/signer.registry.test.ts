import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/prisma', () => ({
    prisma: { battleSigningKey: { upsert: vi.fn(), findMany: vi.fn() } },
}));

import { prisma } from '@config/prisma';
import { loadSigningKeys, persistSigningKey } from '@features/battle/signer';
import type { SigningKeyDescriptor } from '@features/battle/signer';

function key(overrides: Partial<SigningKeyDescriptor> = {}): SigningKeyDescriptor {
    return {
        keyId: 'battle-signer-2026-07',
        algorithm: 'secp256k1',
        publicKey: `0x04${'11'.repeat(64)}`,
        address: `0x${'ab'.repeat(20)}`,
        notBefore: 1_700_000_000,
        notAfter: null,
        status: 'active',
        ...overrides,
    };
}

function row(overrides: Record<string, unknown> = {}) {
    return {
        keyId: 'battle-signer-2026-07',
        algorithm: 'secp256k1',
        publicKey: `0x04${'11'.repeat(64)}`,
        address: `0x${'ab'.repeat(20)}`,
        notBefore: 1_700_000_000n,
        notAfter: null,
        compromised: false,
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.battleSigningKey.upsert).mockResolvedValue({} as never);
});

describe('persisting a key', () => {
    it('records everything a verifier needs to check a signature', async () => {
        await persistSigningKey(key());

        const call = vi.mocked(prisma.battleSigningKey.upsert).mock.calls[0]![0] as {
            create: Record<string, unknown>;
        };
        expect(call.create).toMatchObject({
            keyId: 'battle-signer-2026-07',
            algorithm: 'secp256k1',
            address: `0x${'ab'.repeat(20)}`,
            notBefore: 1_700_000_000n,
            notAfter: null,
        });
    });

    it('lowercases the address, matching what a signature recovers to', async () => {
        await persistSigningKey(key({ address: `0x${'AB'.repeat(20)}` as `0x${string}` }));
        const call = vi.mocked(prisma.battleSigningKey.upsert).mock.calls[0]![0] as { create: { address: string } };
        expect(call.create.address).toBe(`0x${'ab'.repeat(20)}`);
    });

    it('updates the validity window of a key already known', async () => {
        await persistSigningKey(key({ notAfter: 1_760_000_000, status: 'rotated' }));
        const call = vi.mocked(prisma.battleSigningKey.upsert).mock.calls[0]![0] as { update: Record<string, unknown> };
        expect(call.update.notAfter).toBe(1_760_000_000n);
    });

    it('never overwrites the key material of an existing id', async () => {
        // A key id whose material changed is a different key wearing the same name;
        // overwriting would make every receipt under the old material unverifiable.
        await persistSigningKey(key());
        const call = vi.mocked(prisma.battleSigningKey.upsert).mock.calls[0]![0] as { update: Record<string, unknown> };
        expect('publicKey' in call.update).toBe(false);
        expect('address' in call.update).toBe(false);
    });
});

describe('the compromised flag is sticky', () => {
    it('is set when a key is persisted as compromised', async () => {
        await persistSigningKey(key({ status: 'compromised', notAfter: 1_760_000_000 }));
        const call = vi.mocked(prisma.battleSigningKey.upsert).mock.calls[0]![0] as {
            create: { compromised: boolean };
            update: Record<string, unknown>;
        };
        expect(call.create.compromised).toBe(true);
        expect(call.update.compromised).toBe(true);
    });

    it('is never cleared by a later, milder status', async () => {
        // Downgrading it would turn "this key may have signed things we did not authorise"
        // back into an ordinary rotation, and the two demand different responses.
        await persistSigningKey(key({ status: 'rotated', notAfter: 1_760_000_000 }));
        const call = vi.mocked(prisma.battleSigningKey.upsert).mock.calls[0]![0] as { update: Record<string, unknown> };
        expect('compromised' in call.update).toBe(false);
    });
});

describe('loading the registry', () => {
    it('reports the currently signing key as active', async () => {
        vi.mocked(prisma.battleSigningKey.findMany).mockResolvedValue([row()] as never);
        const keys = await loadSigningKeys(new Set(['battle-signer-2026-07']));
        expect(keys[0]?.status).toBe('active');
    });

    it('reports every other key as rotated, whatever the row says', async () => {
        // An operator who swapped keys without registering the old one still gets the right
        // answer, and the old key stays published — the safe direction to fail in.
        vi.mocked(prisma.battleSigningKey.findMany).mockResolvedValue([
            row({ keyId: 'old' }),
            row({ keyId: 'current' }),
        ] as never);

        const keys = await loadSigningKeys(new Set(['current']));

        expect(keys.find((k) => k.keyId === 'old')?.status).toBe('rotated');
        expect(keys.find((k) => k.keyId === 'current')?.status).toBe('active');
    });

    it('never reports a compromised key as active', async () => {
        // Signing with a key known to be compromised is what the runbook exists to end.
        vi.mocked(prisma.battleSigningKey.findMany).mockResolvedValue([
            row({ keyId: 'burned', compromised: true }),
        ] as never);

        const keys = await loadSigningKeys(new Set(['burned']));

        expect(keys[0]?.status).toBe('compromised');
    });

    it('keeps retired keys, so their receipts stay verifiable', async () => {
        vi.mocked(prisma.battleSigningKey.findMany).mockResolvedValue([
            row({ keyId: 'old', notAfter: 1_760_000_000n }),
            row({ keyId: 'current' }),
        ] as never);

        const keys = await loadSigningKeys(new Set(['current']));

        expect(keys).toHaveLength(2);
        expect(keys.find((k) => k.keyId === 'old')?.notAfter).toBe(1_760_000_000);
    });

    it('returns nothing when no key was ever recorded', async () => {
        vi.mocked(prisma.battleSigningKey.findMany).mockResolvedValue([] as never);
        await expect(loadSigningKeys(new Set())).resolves.toEqual([]);
    });

    it('orders by when each key became valid', async () => {
        vi.mocked(prisma.battleSigningKey.findMany).mockResolvedValue([] as never);
        await loadSigningKeys(new Set());
        const call = vi.mocked(prisma.battleSigningKey.findMany).mock.calls[0]![0] as { orderBy: unknown };
        expect(call.orderBy).toEqual({ notBefore: 'asc' });
    });
});
