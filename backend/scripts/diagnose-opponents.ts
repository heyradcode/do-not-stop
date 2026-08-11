/**
 * Read-only diagnostic for "no eligible opponents".
 *
 * `findReadyOpponents` applies four filters, and an empty list looks identical whichever
 * one emptied it. This reports the survivor count after each in turn, so the answer is the
 * first line that drops to zero rather than a guess.
 *
 * Usage (from backend/):
 *   pnpm tsx scripts/diagnose-opponents.ts [--chain evm] [--owner 0xyou]
 *
 * Writes nothing, ever. Safe against production.
 */
import 'dotenv/config';

import { hashRuleset, SOURCE_DEFAULT_RULESET } from '@cryptopets/protocol';

import { prisma } from '../src/config/prisma';
import { servedRuleset } from '../src/features/battle/ledger/ruleset.builder';
import { servedDeploymentId } from '../src/features/battle/ledger/domain';
import { servedChainIdForFamily } from '../src/repositories/battleProgress.overlay';

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

async function main(): Promise<void> {
    const chain = arg('chain', 'evm');
    const owner = arg('owner', '').toLowerCase();
    const now = BigInt(Math.floor(Date.now() / 1000));

    const chainId = servedChainIdForFamily(chain as never);
    const deploymentId = servedDeploymentId();
    const served = await servedRuleset();
    const servedHash = hashRuleset(served);
    const sourceHash = hashRuleset(SOURCE_DEFAULT_RULESET);

    console.log(`chain=${chain} chainId=${chainId ?? '(unserved)'} deployment=${deploymentId}`);
    console.log(`served rulesetHash = ${servedHash}`);
    console.log(`  item catalog entries: ${served.itemCatalog?.length ?? 0}`);
    if (servedHash !== sourceHash) {
        // Not a fault. Worth printing because a mismatch here is what used to make
        // matchmaking compare against a hash no defender had ever signed.
        console.log(`  (differs from SOURCE_DEFAULT_RULESET ${sourceHash} — expected once items are seeded)`);
    }

    const total = await prisma.petRoster.count({ where: { chain } });
    console.log(`\n1. pets in roster                 ${total}`);
    if (total === 0) {
        console.log('   -> nothing indexed. Is indexer-go running with DATABASE_URL set?');
    }

    const notMine = owner
        ? await prisma.petRoster.count({ where: { chain, owner: { not: owner } } })
        : total;
    console.log(`2. not owned by --owner           ${notMine}${owner ? '' : '  (pass --owner to apply)'}`);

    // Cooldown and level use the merged value, so this counts the same way the query does.
    const ready = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM pet_roster r
        LEFT JOIN pet_battle_progress p
          ON p.pet_id = r.pet_id AND p.chain_id = ${chainId} AND p.deployment_id = ${deploymentId}
        WHERE r.chain = ${chain}
          AND GREATEST(r.ready_at, COALESCE(p.ready_at, 0::bigint)) <= ${now}
    `;
    console.log(`3. off cooldown                   ${Number(ready[0]?.n ?? 0)}`);

    const grants = await prisma.defenseAuthorization.findMany({
        where: { ...(chainId ? { chainId } : {}), deploymentId, revokedAt: null },
        select: { defenderOwner: true, rulesetHash: true, allPets: true, expiresAt: true },
    });
    const live = grants.filter((g) => g.expiresAt > now);
    const matching = live.filter((g) => g.rulesetHash.toLowerCase() === servedHash.toLowerCase());
    console.log(`4. live defence grants            ${live.length} (of ${grants.length} unrevoked)`);
    console.log(`   matching the served ruleset    ${matching.length}`);

    if (live.length === 0) {
        console.log('\n=> Nobody has allowed challenges. This is the design, not a bug: a pet with no');
        console.log('   standing DefenseAuthorization cannot be challenged at all (§D). Grant consent');
        console.log('   from another wallet in the Allow Challenges panel, then re-run this.');
    } else if (matching.length === 0) {
        console.log('\n=> Grants exist but every one was signed under a different ruleset, so they cover');
        console.log('   nothing. Those defenders must allow challenges again. Their own panel now says');
        console.log('   so; before that they had no way to find out.');
        for (const g of live) {
            console.log(`   ${g.defenderOwner}  signed under ${g.rulesetHash}`);
        }
    } else {
        console.log('\n=> Consent looks healthy. If the list is still empty, check lines 1-3 above:');
        console.log('   an empty roster, everything on cooldown, or every pet owned by you.');
    }
}

main()
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
