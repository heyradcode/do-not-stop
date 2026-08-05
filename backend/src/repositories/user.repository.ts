import { prisma } from '@config/prisma';

/**
 * Data-access layer for the `users` table. Rows are keyed by the normalized
 * wallet address (EVM lowercased, Solana base58 as-is) — the auth service's
 * `storageKey`. Auth writes on every successful verify; the protected feature
 * and health check read.
 */

export interface UserRecord {
    address: string;
    createdAt: Date;
    lastLogin: Date;
}

/** Create on first login, bump `lastLogin` on every one after. */
export async function upsertUser(address: string): Promise<UserRecord> {
    return prisma.user.upsert({
        where: { address },
        create: { address },
        update: { lastLogin: new Date() },
    });
}

export async function getUser(address: string): Promise<UserRecord | null> {
    return prisma.user.findUnique({ where: { address } });
}

export async function listUsers(): Promise<UserRecord[]> {
    return prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function countUsers(): Promise<number> {
    return prisma.user.count();
}
