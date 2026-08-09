import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
    isProduction: false,
    battleSigner: {
        keyId: 'battle-signer-test',
        privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as string | undefined,
        kmsProvider: undefined as string | undefined,
        requiredAttesters: ['typescript-engine'] as string[],
    },
}));

vi.mock('@config/env', () => ({ env: envMock }));
vi.mock('@config/prisma', () => ({
    prisma: { battleSigningKey: { upsert: vi.fn(), findMany: vi.fn() } },
}));

import { prisma } from '@config/prisma';
import {
    activeSigningKey,
    configureSigner,
    listSigningKeys,
    loadPersistedSigningKeys,
    resetSigner,
} from '@features/battle/signer';

/** When this deployment first started signing — well before any of the restarts below. */
const FIRST_BOOT = 1_700_000_000;
const MUCH_LATER = FIRST_BOOT + 90_000;

function storedRow(overrides: Record<string, unknown> = {}) {
    return {
        keyId: 'battle-signer-test',
        algorithm: 'secp256k1',
        publicKey: `0x04${'11'.repeat(64)}`,
        address: `0x${'ab'.repeat(20)}`,
        notBefore: BigInt(FIRST_BOOT),
        notAfter: null,
        compromised: false,
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    resetSigner();
    vi.mocked(prisma.battleSigningKey.upsert).mockResolvedValue({} as never);
});

describe('a restart must not move the active key validity window forward', () => {
    it('adopts the persisted notBefore instead of this process start time', async () => {
        // Second boot: configureSigner stamps "now", but the key really became valid at
        // FIRST_BOOT and every receipt signed since then was signed under it.
        configureSigner(MUCH_LATER);
        expect(activeSigningKey()?.notBefore).toBe(MUCH_LATER);

        vi.mocked(prisma.battleSigningKey.findMany).mockResolvedValue([storedRow()] as never);
        await loadPersistedSigningKeys();

        expect(activeSigningKey()?.notBefore).toBe(FIRST_BOOT);
    });

    it('keeps a receipt signed before the restart inside the published window', async () => {
        const signedAt = FIRST_BOOT + 500; // long before this boot

        configureSigner(MUCH_LATER);
        vi.mocked(prisma.battleSigningKey.findMany).mockResolvedValue([storedRow()] as never);
        await loadPersistedSigningKeys();

        const published = listSigningKeys().find((k) => k.keyId === 'battle-signer-test')!;
        // The check a verifier runs: was the key valid when the receipt was created?
        expect(signedAt).toBeGreaterThanOrEqual(published.notBefore);
    });

    it('leaves a genuinely new key at its own start time', async () => {
        // Nothing stored yet, so "now" is the truth rather than an artefact of restarting.
        configureSigner(MUCH_LATER);
        vi.mocked(prisma.battleSigningKey.findMany).mockResolvedValue([] as never);
        await loadPersistedSigningKeys();

        expect(activeSigningKey()?.notBefore).toBe(MUCH_LATER);
    });

    it('never moves the window earlier than the stored row claims', async () => {
        // A stored row from *after* this boot would be nonsense; prefer the earlier value
        // rather than trusting whichever number happens to be larger.
        configureSigner(FIRST_BOOT);
        vi.mocked(prisma.battleSigningKey.findMany).mockResolvedValue(
            [storedRow({ notBefore: BigInt(MUCH_LATER) })] as never,
        );
        await loadPersistedSigningKeys();

        expect(activeSigningKey()?.notBefore).toBe(FIRST_BOOT);
    });

    it('still records the active key on boot, so it is never missing from the registry', async () => {
        configureSigner(MUCH_LATER);
        vi.mocked(prisma.battleSigningKey.findMany).mockResolvedValue([storedRow()] as never);
        await loadPersistedSigningKeys();

        expect(vi.mocked(prisma.battleSigningKey.upsert)).toHaveBeenCalledTimes(1);
    });
});
