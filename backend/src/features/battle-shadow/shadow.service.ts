import { simulate, type SkillConfig } from '@cryptopets/protocol';
import type { Prisma } from '@generated/prisma/client';

import { prisma } from '@config/prisma';
import { callVerifyBattle } from '@grpc-client/verifyBattle';

import {
    compareShadowRun,
    type FightOutcome,
    type ObservedOutcome,
    type PredictedOutcome,
} from './compare';
import { recordShadowOutcome } from './metrics';

/**
 * Shadow mode: recompute every settled on-chain battle through the backend engine and
 * compare (§L Phase 2).
 *
 * On-chain battles keep running exactly as they did. Nothing here settles anything, blocks
 * anything, or writes to any table the live path reads — the whole point of a shadow is to
 * be removable without consequence. Every function is best-effort: a failure logs and
 * returns, because a shadow run that could break a real battle would be worse than no
 * shadow at all.
 *
 * Two stages, forced by the contract's own lifecycle. `settleBattle` deletes its
 * request-time snapshot, so the frozen sim inputs only exist between entropy revealing and
 * the settle landing. `predictOnReveal` captures them in that window; `observeOnSettle`
 * fills in the chain's answer when `BattleResolved` arrives.
 */

export interface ShadowInputs {
    dna1: bigint;
    rarity1: number;
    level1: number;
    skill1: number;
    dna2: bigint;
    rarity2: number;
    level2: number;
    skill2: number;
}

export interface PredictRequest {
    chainId: string;
    requestId: bigint;
    petId1: bigint;
    petId2: bigint;
    seed: bigint;
    inputs: ShadowInputs;
    skillConfig: SkillConfig;
}

/**
 * Records what the backend engine expects, before the chain has answered.
 *
 * Also asks indexer-go for its own recomputation. That call is fail-open here, unlike the
 * verify worker's: nothing is being signed, so an unreachable verifier should cost the run
 * its second opinion, not the whole observation.
 */
export async function predictOnReveal(request: PredictRequest): Promise<void> {
    try {
        const outcome = simulate(
            request.inputs.dna1,
            request.inputs.rarity1,
            request.inputs.level1,
            request.inputs.skill1,
            request.inputs.dna2,
            request.inputs.rarity2,
            request.inputs.level2,
            request.inputs.skill2,
            request.seed,
            request.skillConfig,
        );

        const predicted: PredictedOutcome = {
            firstWins: outcome.result.firstWins,
            rounds: outcome.result.rounds,
            winnerHpRemaining: outcome.result.winnerHpRemaining,
            winnerPetId: (outcome.result.firstWins ? request.petId1 : request.petId2).toString(),
            loserPetId: (outcome.result.firstWins ? request.petId2 : request.petId1).toString(),
        };

        const goVerdict = await askGoVerifier(request);

        await prisma.battleShadowRun.upsert({
            where: { chainId_requestId: { chainId: request.chainId, requestId: request.requestId.toString() } },
            // A re-reveal for a request already predicted must not overwrite the original
            // prediction: the first one is the honest record of what the engine said before
            // the chain answered.
            update: {},
            create: {
                chainId: request.chainId,
                requestId: request.requestId.toString(),
                seed: `0x${request.seed.toString(16).padStart(64, '0')}`,
                attackerPetId: request.petId1.toString(),
                defenderPetId: request.petId2.toString(),
                inputs: serializeInputs(request.inputs),
                predicted: toJson(predicted),
                goVerdict: toJson(goVerdict),
                status: 'pending',
            },
        });
    } catch (error) {
        console.error(`[battle-shadow] prediction failed for request ${request.requestId}: ${describe(error)}`);
    }
}

export interface ObserveRequest {
    chainId: string;
    requestId: bigint;
    observed: ObservedOutcome;
}

/** Fills in the chain's answer and records whether it matched. */
export async function observeOnSettle(request: ObserveRequest): Promise<void> {
    try {
        const key = { chainId: request.chainId, requestId: request.requestId.toString() };
        const run = await prisma.battleShadowRun.findUnique({ where: { chainId_requestId: key } });
        if (!run) {
            // Settled without a prediction: the reveal happened before shadow mode was on,
            // or on another process. Nothing to compare, and inventing a prediction now
            // from post-settle state would compare the engine against itself.
            return;
        }
        if (run.observedAt) return; // already compared; a re-emitted log is not new evidence

        const predicted = run.predicted as unknown as PredictedOutcome;
        const goOutcome = (run.goVerdict as { outcome?: FightOutcome } | null)?.outcome ?? null;
        const { status, mismatches } = compareShadowRun(predicted, request.observed, goOutcome);

        await prisma.battleShadowRun.update({
            where: { chainId_requestId: key },
            data: {
                observed: toJson(request.observed),
                mismatches,
                status,
                observedAt: new Date(),
            },
        });

        recordShadowOutcome(status);
        if (status !== 'agreed') {
            // Loud on purpose: this is the signal the phase gate depends on, and a
            // mismatch that only ever appeared in a database row would be missed.
            console.error(
                `[battle-shadow] ${status} for ${request.chainId} request ${request.requestId}: ${mismatches.join('; ')}`,
            );
        }
    } catch (error) {
        console.error(`[battle-shadow] observation failed for request ${request.requestId}: ${describe(error)}`);
    }
}

/**
 * indexer-go's independent recomputation of the same fight.
 *
 * Progression inputs are sent as zeros: `VerifyBattle` computes progression too, but shadow
 * mode does not compare it (see `compare.ts` on why XP is out of scope), and passing state
 * this function cannot observe atomically would be inventing inputs rather than reporting
 * them.
 */
async function askGoVerifier(request: PredictRequest): Promise<{ status: string; outcome?: FightOutcome; detail?: string }> {
    const result = await callVerifyBattle({
        attacker: {
            petId: request.petId1.toString(),
            dna: request.inputs.dna1.toString(),
            rarity: request.inputs.rarity1,
            level: request.inputs.level1,
            skill: request.inputs.skill1,
            xp: 0,
            lastOpponentId: '0',
            streak: 0,
        },
        defender: {
            petId: request.petId2.toString(),
            dna: request.inputs.dna2.toString(),
            rarity: request.inputs.rarity2,
            level: request.inputs.level2,
            skill: request.inputs.skill2,
            xp: 0,
            lastOpponentId: '0',
            streak: 0,
        },
        seed: `0x${request.seed.toString(16).padStart(64, '0')}`,
        skillConfig: request.skillConfig,
        maxLevel: 0,
    });

    if (!result.ok) {
        return { status: result.reason, detail: result.detail };
    }
    return {
        status: 'ok',
        outcome: {
            firstWins: result.response.firstWins,
            rounds: result.response.rounds,
            winnerHpRemaining: result.response.winnerHpRemaining,
        },
    };
}

/** Prisma's JSON columns want plain objects; a typed interface has no index signature. */
function toJson<T>(value: T): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function serializeInputs(inputs: ShadowInputs) {
    return {
        dna1: inputs.dna1.toString(),
        rarity1: inputs.rarity1,
        level1: inputs.level1,
        skill1: inputs.skill1,
        dna2: inputs.dna2.toString(),
        rarity2: inputs.rarity2,
        level2: inputs.level2,
        skill2: inputs.skill2,
    };
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message.split('\n')[0]! : String(error);
}
