import { randomUUID } from 'node:crypto';

import {
    type BattleCommitment,
    type BattleSnapshot,
    type ChainId,
    hashBattleSnapshot,
    hashRuleset,
    isBattleReady,
    type Hex,
    publishRuleset,
    QUICKNET,
    SOURCE_DEFAULT_RULESET,
} from '@cryptopets/protocol';
import type { Prisma } from '@generated/prisma/client';
import { BattleState } from '@generated/prisma/enums';

import { prisma } from '@config/prisma';
import { notifyBattleRoomIfPresent } from '@ws/battleRoomSocket';

import { activeSigningKey, sign, SignerRefusedError } from '../signer';
import { chooseCommitmentRound, roundPublishTime } from '../randomness';

import { type ConsentFailure, consumeDailyBudget, findCoveringAuthorization } from './consent.service';
import { servedDeploymentId } from './domain';
import { OUTBOX_TOPICS } from './outbox';
import { buildPetSnapshot } from './snapshot.builder';
import { applyTransition, openBattle } from './transitions';

/**
 * The accept flow (§E, §J).
 *
 * This is where the one ordering that can never be relaxed is enforced in code: the photo is
 * taken, a round that has not published yet is chosen, the commitment is signed, and the
 * signed commitment is the thing this function *returns* — synchronously, in the same
 * response that told the caller their battle was accepted. There is no path that answers
 * "accepted" without the caller also receiving the signed commitment: if round-selection or
 * signing fails, the ledger row this call created is unwound to `rejected` and the caller is
 * told the battle was never accepted at all.
 *
 * Three stages, deliberately not one transaction:
 *
 * - **Stage A** (one DB transaction, in `openBattle`): consume the intent, lock both pets, and
 *   persist the frozen snapshot — before any randomness for this battle exists. This is
 *   `accepted`.
 * - **Stage B** (network + KMS, no DB writes): choose a drand round that has not published,
 *   build the commitment, sign it.
 * - **Stage C** (one DB transaction, in `applyTransition`): record the commitment and move to
 *   `committed`; or, if Stage B failed, move Stage A's row to `rejected` and release the locks.
 *
 * Splitting it this way means a crash between Stage A and Stage C leaves a diagnosable
 * `accepted` row rather than losing the intent's consumption with no trace at all.
 */

export interface AcceptBattleRequest {
    intentHash: string;
    nowSeconds: number;
    /**
     * The shareable room this accept call came through, if any (§J). Optional: a
     * battle accepted without a room simply gets no spectator notifications — every
     * state change still lands in the read APIs (Step 27), just with no push channel
     * to announce it faster.
     */
    roomId?: string;
}

export type AcceptRejection =
    | 'intent-not-found'
    | 'intent-already-consumed'
    | 'intent-expired'
    | 'attacker-pet-missing'
    | 'defender-pet-missing'
    | 'attacker-not-ready'
    | 'defender-not-ready'
    | ConsentFailure
    | 'pet-locked'
    | 'drand-unavailable'
    | 'signer-unavailable';

export interface AcceptedBattle {
    battleId: string;
    commitment: BattleCommitment;
    commitmentHash: Hex;
    signature: Hex;
    signingKeyId: string;
}

export type AcceptBattleResult =
    | { ok: true; battle: AcceptedBattle }
    | { ok: false; reason: AcceptRejection; detail: string };

const MAX_COMMITMENT_CHAIN_RETRIES = 5;

export async function acceptBattle(request: AcceptBattleRequest): Promise<AcceptBattleResult> {
    const intent = await prisma.battleIntent.findUnique({ where: { intentHash: request.intentHash } });
    if (!intent) {
        return reject('intent-not-found', `no intent ${request.intentHash}`);
    }
    if (intent.consumedAt) {
        return reject('intent-already-consumed', 'this intent already produced a battle');
    }
    if (BigInt(request.nowSeconds) >= intent.expiresAt) {
        return reject('intent-expired', `intent expired at ${intent.expiresAt}`);
    }

    const chainId = intent.chainId as ChainId;
    const [attacker, defender] = await Promise.all([
        buildPetSnapshot(chainId, intent.attackerPetId),
        buildPetSnapshot(chainId, intent.defenderPetId),
    ]);
    if (!attacker) {
        return reject('attacker-pet-missing', `pet ${intent.attackerPetId} is not in the roster`);
    }
    if (!defender) {
        return reject('defender-pet-missing', `pet ${intent.defenderPetId} is not in the roster`);
    }
    // Both pets must be off cooldown, mirroring GameLogic.sol's requirement that neither side
    // of an on-chain battle is mid-recovery.
    if (!isBattleReady(attacker, request.nowSeconds)) {
        return reject('attacker-not-ready', `attacker ready at ${attacker.readyAt}`);
    }
    if (!isBattleReady(defender, request.nowSeconds)) {
        return reject('defender-not-ready', `defender ready at ${defender.readyAt}`);
    }

    const ruleset = SOURCE_DEFAULT_RULESET;
    const rulesetHash = hashRuleset(ruleset);
    await ensureRulesetPublished(rulesetHash);

    const coverage = await findCoveringAuthorization({
        chainId,
        defenderOwner: defender.owner,
        defenderPetId: defender.petId.toString(),
        attackerLevel: attacker.level,
        rulesetHash,
        nowSeconds: request.nowSeconds,
    });
    if (!coverage.ok) {
        return reject(coverage.reason, coverage.detail);
    }

    // A network read, deliberately before any write: a battle should never be accepted (and
    // an intent never consumed) over a round choice that then turns out to be unobtainable.
    const roundChoice = await chooseCommitmentRound(request.nowSeconds);
    if (!roundChoice.ok) {
        return reject('drand-unavailable', roundChoice.detail);
    }

    // Consumes one use of the defender's daily budget before the ledger row exists. A later
    // pet-locked conflict (rare: it means a lock slipped past the readiness check above between
    // here and Stage A) would then leave this use spent with no battle created. That is a
    // conservative failure, not a permissive one — the cap is never exceeded, only occasionally
    // reached one battle early — and fixing it needs threading a transaction client through
    // consumeDailyBudget, which is not worth the added complexity for a race this narrow.
    const budget = await consumeDailyBudget(coverage.authorizationHash, coverage.maxBattlesPerDay, request.nowSeconds);
    if (!budget.ok) {
        return reject('daily-cap-reached', 'defender daily battle cap reached');
    }

    const battleId = `btl_${randomUUID()}`;
    const domain = { chainId, deploymentId: servedDeploymentId() };
    const snapshot: BattleSnapshot = { domain, attacker, defender, takenAt: request.nowSeconds };
    const snapshotHash = hashBattleSnapshot(snapshot);

    // Stage A: everything that must be durable before any randomness exists.
    const opened = await openBattle({
        consumeIntentHash: intent.intentHash,
        petIds: [attacker.petId.toString(), defender.petId.toString()],
        ledger: {
            battleId,
            chainId,
            deploymentId: domain.deploymentId,
            state: BattleState.accepted,
            intentHash: intent.intentHash,
            authorizationHash: coverage.authorizationHash,
            attackerPetId: attacker.petId.toString(),
            attackerOwner: attacker.owner,
            defenderPetId: defender.petId.toString(),
            defenderOwner: defender.owner,
            snapshot: serializeBigints(snapshot),
            snapshotHash,
            rulesetHash,
            rulesetVersion: ruleset.version,
            // Filled in Stage C once the round is committed and signed; zero is not a legal
            // committed round, so a row stuck here is unambiguously still `accepted`.
            drandChainHash: '',
            drandRound: 0n,
            acceptedAt: 0n,
            roomId: request.roomId ?? null,
        },
    });
    if (!opened.ok) {
        return opened.reason === 'pet-locked'
            ? reject('pet-locked', `pet ${opened.petId} already has an open battle`)
            : reject('intent-already-consumed', 'this intent already produced a battle');
    }

    // Stage B + C: sign the commitment and record it, retrying if another accept call under the
    // same signing key wins the chain position first.
    try {
        const signed = await signAndRecordCommitment({
            battleId,
            domain,
            intentHash: intent.intentHash as Hex,
            defenseAuthorizationHash: coverage.authorizationHash as Hex,
            snapshot,
            rulesetVersion: ruleset.version,
            rulesetHash,
            drandChainHash: QUICKNET.chainHash,
            drandRound: roundChoice.round,
            acceptedAt: request.nowSeconds,
        });
        notifyBattleRoomIfPresent(request.roomId ?? null, {
            type: 'battle-updated',
            battleId,
            state: BattleState.committed,
        });
        return { ok: true, battle: { battleId, ...signed } };
    } catch (error) {
        await unwindToRejected(battleId, error instanceof Error ? error.message : String(error));
        notifyBattleRoomIfPresent(request.roomId ?? null, {
            type: 'battle-updated',
            battleId,
            state: BattleState.rejected,
        });
        if (error instanceof SignerRefusedError) {
            return reject('signer-unavailable', error.message);
        }
        throw error;
    }
}

type CommitmentSeed = Omit<BattleCommitment, 'previousCommitmentHash' | 'signingKeyId'>;

/**
 * Builds, signs, and durably records a commitment, retrying if the chain-position write
 * conflicts with another accept call under the same signing key.
 *
 * The retry re-reads the chain head and re-signs on every attempt, because the signature
 * covers `sequence` and `previousCommitmentHash`: a stale link cannot be patched onto an
 * already-produced signature, only replaced by producing a new one.
 *
 * Recording happens inside the same `applyTransition` that moves the ledger row from
 * `accepted` to `committed`, so a chain-position conflict rolls the *whole* transaction back —
 * including the state move — leaving the row exactly as retriable as it was before this
 * attempt.
 */
async function signAndRecordCommitment(
    seed: CommitmentSeed,
): Promise<{ commitment: BattleCommitment; commitmentHash: Hex; signature: Hex; signingKeyId: string }> {
    for (let attempt = 0; attempt < MAX_COMMITMENT_CHAIN_RETRIES; attempt++) {
        const key = activeSigningKey();
        if (!key) {
            throw new SignerRefusedError('signer-not-configured', 'no active signing key');
        }

        const previous = await prisma.battleCommitment.findFirst({
            where: { signingKeyId: key.keyId },
            orderBy: { sequence: 'desc' },
            select: { commitmentHash: true, sequence: true },
        });
        const sequence = previous ? previous.sequence + 1n : 1n;

        const commitment: BattleCommitment = {
            ...seed,
            previousCommitmentHash: (previous?.commitmentHash ?? null) as Hex | null,
            signingKeyId: key.keyId,
        };

        const signResult = await sign({ kind: 'commitment', commitment }, seed.acceptedAt);

        try {
            await applyTransition({
                battleId: seed.battleId,
                from: BattleState.accepted,
                to: BattleState.committed,
                patch: {
                    drandChainHash: commitment.drandChainHash,
                    drandRound: BigInt(commitment.drandRound),
                    acceptedAt: BigInt(commitment.acceptedAt),
                },
                onApplied: async (tx) => {
                    await tx.battleCommitment.create({
                        data: {
                            commitmentHash: signResult.digest,
                            battleId: seed.battleId,
                            sequence,
                            previousCommitmentHash: commitment.previousCommitmentHash,
                            signingKeyId: signResult.keyId,
                            signature: signResult.signature,
                            payload: serializeBigints(commitment),
                            acceptedAt: BigInt(commitment.acceptedAt),
                            // Set in the same transaction that persists the commitment: the
                            // accept response is built from this exact result immediately
                            // after, so "delivered" and "persisted" land together (threat T15).
                            deliveredAt: new Date(),
                        },
                    });
                },
                outbox: [
                    {
                        battleId: seed.battleId,
                        topic: OUTBOX_TOPICS.awaitBeacon,
                        availableAt: roundPublishTime(commitment.drandRound),
                    },
                ],
            });
            return {
                commitment,
                commitmentHash: signResult.digest,
                signature: signResult.signature,
                signingKeyId: signResult.keyId,
            };
        } catch (error) {
            if ((error as { code?: string }).code === 'P2002') {
                continue; // another accept call took this chain position; retry with a fresh read
            }
            throw error;
        }
    }
    throw new Error(`could not claim a commitment chain position after ${MAX_COMMITMENT_CHAIN_RETRIES} attempts`);
}

async function unwindToRejected(battleId: string, reason: string): Promise<void> {
    await applyTransition({
        battleId,
        from: BattleState.accepted,
        to: BattleState.rejected,
        patch: { failureReason: reason },
    });
}

/**
 * Publishes the active ruleset bundle on first use.
 *
 * A receipt or commitment naming a `rulesetHash` with no matching published bundle cannot be
 * replayed by anyone (§H), so this runs before the hash is ever referenced rather than as a
 * background job that might lag behind it.
 */
async function ensureRulesetPublished(expectedHash: Hex): Promise<void> {
    const existing = await prisma.battleRuleset.findUnique({ where: { rulesetHash: expectedHash } });
    if (existing) {
        return;
    }
    const { hash, json } = publishRuleset(SOURCE_DEFAULT_RULESET);
    try {
        await prisma.battleRuleset.create({
            data: {
                rulesetHash: hash,
                version: SOURCE_DEFAULT_RULESET.version,
                engineId: SOURCE_DEFAULT_RULESET.engineId,
                engineVersion: SOURCE_DEFAULT_RULESET.engineVersion,
                bundle: JSON.parse(json),
            },
        });
    } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') {
            throw error;
        }
        // Another concurrent accept call published it first; that is fine, the row exists now.
    }
}

/** Prisma's Json columns cannot hold a bigint; stringify it in place before storing. */
function serializeBigints<T>(value: T): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

function reject(reason: AcceptRejection, detail: string): AcceptBattleResult {
    return { ok: false, reason, detail };
}
