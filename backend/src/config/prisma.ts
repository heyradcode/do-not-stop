import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env } from './env';

/**
 * Single shared PrismaClient for the process.
 *
 * Prisma 7's `prisma-client` generator has no built-in query engine, so the
 * runtime connection is provided by a driver adapter (`@prisma/adapter-pg`).
 *
 * In dev, `tsx watch` reloads modules on change; caching the instance on
 * `globalThis` avoids opening a new connection pool on every reload.
 */
const globalForPrisma = globalThis as unknown as {
    prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
    const adapter = new PrismaPg({ connectionString: env.databaseUrl });
    return new PrismaClient({
        adapter,
        log: env.isProduction ? ['error'] : ['warn', 'error'],
    });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (!env.isProduction) {
    globalForPrisma.prisma = prisma;
}
