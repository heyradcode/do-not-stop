import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Single shared PrismaClient for the process.
 *
 * Prisma 7's `prisma-client` generator has no built-in query engine, so the
 * runtime connection is provided by a driver adapter (`@prisma/adapter-pg`).
 * The `DATABASE_URL` here is the same one the CLI uses via prisma.config.ts.
 *
 * In dev, `tsx watch` reloads modules on change; caching the instance on
 * `globalThis` avoids opening a new connection pool on every reload.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy env.example to .env and configure it.');
}

const globalForPrisma = globalThis as unknown as {
    prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
    const adapter = new PrismaPg({ connectionString });
    return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
    });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}
