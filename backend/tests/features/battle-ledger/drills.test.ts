import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ethers } from 'ethers';

/**
 * The §L Phase 3 drills, executed rather than described.
 *
 * `docs/battle-protocol.md` Appendix B documents the procedures; this file runs the mechanical
 * half of each one on every CI pass, so a drill cannot quietly stop being true between
 * incidents. What is deliberately not here is the human half — who is paged, who decides —
 * which is what the runbook prose is for.
 */

vi.mock('@config/env', () => ({
    env: {
        nodeEnv: 'test',
        battle: { enabled: true },
        battleSigner: {},
    },
}));

vi.mock('@config/prisma', () => ({
    prisma: { battleOutbox: { updateMany: vi.fn(), findMany: vi.fn() } },
}));

import { env } from '@config/env';
import { prisma } from '@config/prisma';
import { listDeadLetters, requeueDeadLetter } from '@features/battle-ledger';
import { backendBattleModeEnabled } from '@features/battle-ledger';
import { listSigningKeys, registerRotatedKey, resetSigner } from '@features/battle-signer';

const NOW = new Date('2026-07-26T12:00:00.000Z');

beforeEach(() => {
    vi.clearAllMocks();
    (env as { battle: { enabled: boolean } }).battle.enabled = true;
});

describe('drill 1: recovery from dead-lettered work', () => {
    it('lists what is parked, with the reason it died', async () => {
        vi.mocked(prisma.battleOutbox.findMany).mockResolvedValue([
            { id: 'msg_1', battleId: 'btl_1', topic: 'compute', payload: {}, attempts: 8 },
        ] as never);

        const parked = await listDeadLetters();

        expect(parked).toEqual([{ id: 'msg_1', battleId: 'btl_1', topic: 'compute', payload: {}, attempts: 8 }]);
        expect(prisma.battleOutbox.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { deadLetteredAt: { not: null } } }),
        );
    });

    it('requeues a dead letter with a fresh retry budget', async () => {
        vi.mocked(prisma.battleOutbox.updateMany).mockResolvedValue({ count: 1 } as never);

        await expect(requeueDeadLetter('msg_1', NOW)).resolves.toBe(true);

        const call = vi.mocked(prisma.battleOutbox.updateMany).mock.calls[0]![0] as {
            where: unknown;
            data: Record<string, unknown>;
        };
        // Attempts reset, or the first hiccup after a fix would dead-letter it again.
        expect(call.data.attempts).toBe(0);
        expect(call.data.deadLetteredAt).toBeNull();
        expect(call.data.availableAt).toBe(NOW);
        // The lock is cleared too: whichever worker died holding it is not coming back.
        expect(call.data.lockedAt).toBeNull();
        expect(call.data.lockedBy).toBeNull();
    });

    it('keeps lastError, because a requeue is not evidence the cause is gone', async () => {
        vi.mocked(prisma.battleOutbox.updateMany).mockResolvedValue({ count: 1 } as never);
        await requeueDeadLetter('msg_1', NOW);

        const call = vi.mocked(prisma.battleOutbox.updateMany).mock.calls[0]![0] as { data: Record<string, unknown> };
        expect('lastError' in call.data).toBe(false);
    });

    it('only requeues messages that actually dead-lettered', async () => {
        vi.mocked(prisma.battleOutbox.updateMany).mockResolvedValue({ count: 1 } as never);
        await requeueDeadLetter('msg_1', NOW);

        const call = vi.mocked(prisma.battleOutbox.updateMany).mock.calls[0]![0] as { where: Record<string, unknown> };
        // Guarded, so requeuing an id that is merely slow cannot reset a live message's
        // backoff out from under the worker holding it.
        expect(call.where.deadLetteredAt).toEqual({ not: null });
    });

    it('reports a mistyped id as nothing happened rather than silent success', async () => {
        vi.mocked(prisma.battleOutbox.updateMany).mockResolvedValue({ count: 0 } as never);
        await expect(requeueDeadLetter('typo', NOW)).resolves.toBe(false);
    });
});

describe('drill 3: key rotation', () => {
    beforeEach(() => {
        resetSigner();
    });

    function descriptor(keyId: string, notAfter: number | null) {
        const wallet = ethers.Wallet.createRandom();
        return {
            keyId,
            algorithm: 'secp256k1' as const,
            publicKey: wallet.signingKey.publicKey as `0x${string}`,
            address: wallet.address.toLowerCase() as `0x${string}`,
            notBefore: 1_700_000_000,
            notAfter,
            status: notAfter === null ? ('active' as const) : ('retired' as const),
        };
    }

    it('keeps a rotated key published, so receipts it signed still verify', () => {
        // The rule the drill exists to protect: delisting a retired key silently
        // invalidates every receipt it ever signed.
        registerRotatedKey(descriptor('battle-signer-2026-06', 1_760_000_000));

        const published = listSigningKeys();
        expect(published.map((key) => key.keyId)).toContain('battle-signer-2026-06');
    });

    it('publishes a retired key with the window it was valid for', () => {
        registerRotatedKey(descriptor('battle-signer-2026-06', 1_760_000_000));

        const retired = listSigningKeys().find((key) => key.keyId === 'battle-signer-2026-06');
        expect(retired?.notAfter).toBe(1_760_000_000);
        expect(retired?.status).toBe('retired');
    });

    it('keeps every rotated key, not just the most recent', () => {
        registerRotatedKey(descriptor('battle-signer-2026-05', 1_750_000_000));
        registerRotatedKey(descriptor('battle-signer-2026-06', 1_760_000_000));

        const ids = listSigningKeys().map((key) => key.keyId);
        expect(ids).toContain('battle-signer-2026-05');
        expect(ids).toContain('battle-signer-2026-06');
    });
});

describe('the mode switch', () => {
    it('reports enabled when the flag is set', () => {
        expect(backendBattleModeEnabled()).toBe(true);
    });

    it('reports disabled when it is not', () => {
        (env as { battle: { enabled: boolean } }).battle.enabled = false;
        expect(backendBattleModeEnabled()).toBe(false);
    });
});
