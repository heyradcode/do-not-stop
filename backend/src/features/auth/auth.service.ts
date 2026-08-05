import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import { env } from '@config/env';
import { isEvmAddress } from '@utils';
import { upsertUser as upsertUserRow, type UserRecord } from '@repositories/user.repository';
import { verifySolanaSignature } from './solana';
import type { User } from './auth.types';

/** API shape: dates as ISO strings (see {@link User}). */
function toUser(row: UserRecord): User {
    return {
        address: row.address,
        createdAt: row.createdAt.toISOString(),
        lastLogin: row.lastLogin.toISOString(),
    };
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

/** Create on first login, bump `lastLogin` after — persisted in Postgres. */
export async function upsertUser(storageKey: string): Promise<User> {
    return toUser(await upsertUserRow(storageKey));
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
