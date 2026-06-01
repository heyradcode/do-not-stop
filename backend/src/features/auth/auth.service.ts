import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { env } from '../../config/env';
import type { User } from './auth.types';

/** In-memory storage for demo (use database in production). */
export const users = new Map<string, User>();

const ED25519_SIG_LEN = 64;

export function isEvmAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/i.test(address);
}

function decodeSolanaSignatureWire(signature: string): Uint8Array | null {
    const t = signature.trim();
    const hex = t.startsWith('0x') || t.startsWith('0X') ? t.slice(2) : t;
    if (/^[0-9a-fA-F]{128}$/i.test(hex)) {
        try {
            const out = Buffer.from(hex, 'hex');
            if (out.length === ED25519_SIG_LEN) {
                return new Uint8Array(out);
            }
        } catch {
            /* fall through */
        }
    }
    try {
        const decoded = bs58.decode(t);
        if (decoded.length === ED25519_SIG_LEN) {
            return new Uint8Array(decoded);
        }
    } catch {
        /* fall through */
    }
    try {
        const buf = Buffer.from(t, 'base64');
        if (buf.length === ED25519_SIG_LEN) {
            return new Uint8Array(buf);
        }
    } catch {
        /* fall through */
    }
    return null;
}

function verifySolanaSignature(address: string, signatureWire: string, message: string): boolean {
    try {
        const pubKey = new Uint8Array(bs58.decode(address));
        if (pubKey.length !== 32) {
            return false;
        }
        const sig = decodeSolanaSignatureWire(signatureWire);
        if (!sig) {
            return false;
        }
        const msgBytes = new TextEncoder().encode(message);
        return nacl.sign.detached.verify(msgBytes, sig, pubKey);
    } catch {
        return false;
    }
}

export function createNonce(): string {
    return (
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15)
    );
}

export function verifyWalletSignature(
    address: string,
    signature: string,
    nonce: string
): { ok: true; storageKey: string } | { ok: false; error: string } {
    const message = `Sign this message to authenticate: ${nonce}`;

    if (isEvmAddress(address)) {
        const recoveredAddress = ethers.verifyMessage(message, signature);
        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            return { ok: false, error: 'Invalid signature' };
        }
        return { ok: true, storageKey: address.toLowerCase() };
    }

    if (!verifySolanaSignature(address, signature, message)) {
        return { ok: false, error: 'Invalid signature' };
    }
    return { ok: true, storageKey: address };
}

export function upsertUser(storageKey: string): User {
    let user = users.get(storageKey);
    if (!user) {
        user = {
            address: storageKey,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
        };
        users.set(storageKey, user);
        return user;
    }

    user.lastLogin = new Date().toISOString();
    users.set(storageKey, user);
    return user;
}

export function issueToken(storageKey: string): string {
    return jwt.sign(
        {
            address: storageKey,
            userId: storageKey,
        },
        env.jwtSecret,
        { expiresIn: '24h' }
    );
}

export function getUserCount(): number {
    return users.size;
}
