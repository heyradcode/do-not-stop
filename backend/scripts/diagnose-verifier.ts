import 'dotenv/config';

import { env } from '@config/env';
import { callVerifyBattle } from '../src/grpc/verifyBattle';

/**
 * Whether the independent verifier (§F) can actually be reached, asked directly.
 *
 * A battle stalls at `computed` until indexer-go agrees with the engine, and the three ways
 * that fails — not configured, breaker open, transport error — are indistinguishable from
 * the UI, which says only that it is waiting. This runs the same call the verify worker
 * runs, against the same configuration, and prints which one it is.
 *
 * Read-only: it verifies a throwaway matchup and stores nothing.
 */

const PET = {
    petId: '1',
    level: 10,
    xp: 0,
    attack: 100,
    defense: 80,
    intelligence: 90,
    life: 100,
    speed: 70,
    element: 1,
    skill: 0,
    rarity: 3,
    equipment: [],
};

async function main(): Promise<void> {
    console.log(`INDEXER_GRPC_ADDR  ${env.indexerGrpc.addr ?? '(unset — verification cannot run)'}`);
    console.log(`INDEXER_PROTO_PATH ${env.indexerGrpc.protoPath ?? '(auto-resolved)'}\n`);

    const started = Date.now();
    const result = await callVerifyBattle({
        attacker: PET as never,
        defender: { ...PET, petId: '2' } as never,
        seed: `0x${'11'.repeat(32)}`,
        skillConfig: {
            berserkerAtkBonusPct: 20,
            tankDefBonusPct: 20,
            assassinCritBonusPct: 15,
            mageIntBonusPct: 20,
            healerHealPct: 10,
        } as never,
        maxLevel: 100,
    });
    const ms = Date.now() - started;

    if (result.ok) {
        console.log(`REACHABLE (${ms}ms) — the verifier answered, so §F can complete.`);
        console.log(`  winner=${JSON.stringify((result.response as { winner?: unknown }).winner)}`);
        return;
    }

    console.log(`UNREACHABLE (${ms}ms)`);
    console.log(`  reason: ${result.reason}`);
    console.log(`  detail: ${result.detail}`);
    console.log(
        '\nEvery battle stalls at `computed` and then forfeits while this is failing: the backend ' +
            'will not sign a receipt the independent port has not confirmed (§F).',
    );
}

void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
