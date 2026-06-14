import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Wallet } from 'ethers';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import jwt from 'jsonwebtoken';

// Mock the repository so the service never reaches Prisma/Postgres.
const upsertUserRow = vi.fn();
vi.mock('../../../src/repositories/user.repository', () => ({
    upsertUser: (address: string) => upsertUserRow(address),
}));

import {
    verifyWalletSignature,
    upsertUser,
    issueToken,
} from '../../../src/features/auth/auth.service';

const NONCE = 'nonce-abc';
const message = `Sign this message to authenticate: ${NONCE}`;

describe('verifyWalletSignature', () => {
    describe('EVM', () => {
        it('accepts a valid signature and returns the lowercased address as storageKey', async () => {
            const wallet = Wallet.createRandom();
            const signature = await wallet.signMessage(message);

            const result = verifyWalletSignature(wallet.address, signature, NONCE);

            expect(result).toEqual({ ok: true, storageKey: wallet.address.toLowerCase() });
        });

        it('rejects a signature that recovers to a different address', async () => {
            const wallet = Wallet.createRandom();
            const other = Wallet.createRandom();
            const signature = await other.signMessage(message);

            const result = verifyWalletSignature(wallet.address, signature, NONCE);

            expect(result).toEqual({ ok: false, error: 'Invalid signature' });
        });

        it('rejects when the nonce (and thus signed message) differs', async () => {
            const wallet = Wallet.createRandom();
            const signature = await wallet.signMessage(message);

            const result = verifyWalletSignature(wallet.address, signature, 'different-nonce');

            expect(result).toEqual({ ok: false, error: 'Invalid signature' });
        });
    });

    describe('Solana', () => {
        const signSolana = () => {
            const keypair = nacl.sign.keyPair();
            const address = bs58.encode(keypair.publicKey);
            const sig = bs58.encode(
                nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey),
            );
            return { address, sig };
        };

        it('accepts a valid signature and returns the base58 address as storageKey', () => {
            const { address, sig } = signSolana();

            const result = verifyWalletSignature(address, sig, NONCE);

            expect(result).toEqual({ ok: true, storageKey: address });
        });

        it('rejects an invalid Solana signature', () => {
            const { address } = signSolana();
            const bogus = bs58.encode(new Uint8Array(64));

            const result = verifyWalletSignature(address, bogus, NONCE);

            expect(result).toEqual({ ok: false, error: 'Invalid signature' });
        });
    });
});

describe('upsertUser', () => {
    beforeEach(() => upsertUserRow.mockReset());

    it('delegates to the repository and maps dates to ISO strings', async () => {
        upsertUserRow.mockResolvedValue({
            address: '0xabc',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            lastLogin: new Date('2026-06-13T12:00:00.000Z'),
        });

        const user = await upsertUser('0xabc');

        expect(upsertUserRow).toHaveBeenCalledWith('0xabc');
        expect(user).toEqual({
            address: '0xabc',
            createdAt: '2026-01-01T00:00:00.000Z',
            lastLogin: '2026-06-13T12:00:00.000Z',
        });
    });
});

describe('issueToken', () => {
    it('signs a JWT carrying the storageKey as address and userId', () => {
        const token = issueToken('0xdeadbeef');
        const decoded = jwt.decode(token) as { address: string; userId: string; exp: number };

        expect(decoded.address).toBe('0xdeadbeef');
        expect(decoded.userId).toBe('0xdeadbeef');
        expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('produces a token verifiable with the test secret', () => {
        const token = issueToken('0xkey');
        // tests/setup.ts sets JWT_SECRET=test-secret
        const verified = jwt.verify(token, 'test-secret') as { address: string };
        expect(verified.address).toBe('0xkey');
    });
});
