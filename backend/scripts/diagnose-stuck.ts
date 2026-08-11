import 'dotenv/config';

import { prisma } from '@config/prisma';
/**
 * Whatever is in flight, and what its outbox message is doing about it. Read-only.
 *
 * A battle sitting in a non-terminal state is either being retried or waiting on nothing at
 * all, and those look identical from the UI. `attempts`, `availableAt` and `lastError` are
 * what tell them apart, and none of them is served anywhere.
 */

async function main(): Promise<void> {
    console.log(`INDEXER_GRPC_ADDR = ${process.env.INDEXER_GRPC_ADDR ?? '(unset)'}\n`);

    const TERMINAL = ['batched', 'rejected', 'expired', 'forfeited', 'verification_failed', 'signing_failed'];
    const live = await prisma.battleLedger.findMany({
        where: { state: { notIn: TERMINAL as never } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { battleId: true, state: true, chainId: true, createdAt: true, updatedAt: true },
    });

    if (live.length === 0) {
        console.log('nothing in flight');
    }

    for (const battle of live) {
        console.log(`${battle.state.padEnd(12)} ${battle.battleId}`);
        console.log(`   created ${battle.createdAt.toISOString()}  updated ${battle.updatedAt.toISOString()}`);

        const messages = await prisma.battleOutbox.findMany({
            where: { battleId: battle.battleId },
            orderBy: { createdAt: 'asc' },
        });
        if (messages.length === 0) {
            // The state machine advances on these, so a non-terminal battle with no message
            // is waiting on something that will never arrive.
            console.log('   NO OUTBOX MESSAGE — nothing will move this battle');
        }
        for (const message of messages) {
            const status = message.processedAt
                ? 'processed'
                : message.deadLetteredAt
                  ? 'DEAD-LETTERED'
                  : message.lockedBy
                    ? `locked by ${message.lockedBy}`
                    : 'pending';
            console.log(
                `   [${message.topic}] attempts=${message.attempts} ` +
                    `availableAt=${message.availableAt.toISOString()} ${status}`,
            );
            if (message.lastError) console.log(`      lastError: ${message.lastError}`);
        }
        console.log('');
    }
}

void main()
    .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => void prisma.$disconnect());
