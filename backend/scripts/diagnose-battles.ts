import 'dotenv/config';

import { prisma } from '@config/prisma';
import { env } from '@config/env';

/**
 * Recent battles and what stalled them. Read-only: SELECT only, no writes of any kind.
 *
 * Exists because `failureReason` is the only record of why a battle stopped, and it is not
 * served anywhere an operator can read it without a database client.
 */

async function main(): Promise<void> {
    const battles = await prisma.battleLedger.findMany({
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
            battleId: true,
            chainId: true,
            deploymentId: true,
            state: true,
            failureReason: true,
            rulesetHash: true,
            createdAt: true,
        },
    });

    console.log(`served chain ids: ${env.battle.chainIds.join(', ')}\n`);
    if (battles.length === 0) {
        console.log('no battles on record');
        return;
    }

    for (const battle of battles) {
        // The comparison that matters: the signer is keyed by chain *family*, so a chainId
        // that is not a CAIP-2 `eip155:` string resolves to the Solana domain regardless of
        // what it meant to say.
        const family = battle.chainId.startsWith('eip155:') ? 'evm' : 'solana';
        const served = env.battle.chainIds.includes(battle.chainId);
        console.log(
            `${battle.createdAt.toISOString()}  ${battle.state.padEnd(20)} ` +
                `chainId=${JSON.stringify(battle.chainId)} family=${family} served=${served}`,
        );
        console.log(`   ${battle.battleId}  deployment=${battle.deploymentId}`);
        if (battle.failureReason) console.log(`   failure: ${battle.failureReason}`);
    }

    const chains = await prisma.battleLedger.groupBy({ by: ['chainId'], _count: { chainId: true } });
    console.log('\ndistinct chain ids on record:');
    for (const row of chains) {
        console.log(`  ${JSON.stringify(row.chainId)}  x${row._count.chainId}`);
    }
}

void main()
    .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => void prisma.$disconnect());
