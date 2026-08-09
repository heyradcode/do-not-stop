import {
    type BattleSnapshot,
    computeProgression,
    bonusFromEquipment,
    hashCombatLog,
    type Hex,
    loadRulesetBundle,
    simulate,
} from '@cryptopets/protocol';
import { BattleState } from '@generated/prisma/enums';
import type { Prisma } from '@generated/prisma/client';

import { prisma } from '@config/prisma';
import { applyTransition, type ClaimedMessage, completeOutbox, OUTBOX_TOPICS } from '@features/battle/ledger';
import { notifyBattleRoomIfPresent } from '@ws/battleRoomSocket';

/**
 * Handles `compute` messages: `seeded` -> `computed` (§F).
 *
 * Runs the canonical TypeScript engine on the frozen snapshot and the verified seed, records
 * the result, the progression delta, and the combat log alongside its hash, and hands off to
 * `verify` — the independent Go recomputation that has to agree before anything here can be
 * signed (Step 25; this worker never signs anything itself).
 *
 * The ruleset is loaded from the published bundle this battle actually named, not from
 * whatever the process's current defaults happen to be. A balance change between acceptance
 * and this worker running must not retroactively change the fight; `loadRulesetBundle` checks
 * the bundle's hash against `rulesetHash` before trusting a single field in it.
 */
export async function processComputeMessage(message: ClaimedMessage, nowSeconds: number): Promise<void> {
    const battle = await prisma.battleLedger.findUnique({ where: { battleId: message.battleId } });
    if (!battle) {
        await completeOutbox(message.id, new Date(nowSeconds * 1000));
        return;
    }
    if (battle.state !== BattleState.seeded) {
        // Idempotent no-op: already computed by another worker, or this message is a stale
        // retry of a transition that already landed.
        await completeOutbox(message.id, new Date(nowSeconds * 1000));
        return;
    }
    if (!battle.seed) {
        throw new Error(`battle ${battle.battleId} is seeded but has no seed recorded`);
    }

    const rulesetRow = await prisma.battleRuleset.findUnique({ where: { rulesetHash: battle.rulesetHash } });
    if (!rulesetRow) {
        throw new Error(`no published ruleset bundle for ${battle.rulesetHash}; cannot compute battle ${battle.battleId}`);
    }
    const ruleset = loadRulesetBundle(JSON.stringify(rulesetRow.bundle), battle.rulesetHash as Hex);

    const snapshot = battle.snapshot as unknown as BattleSnapshot;
    const attacker = deserializePet(snapshot.attacker);
    const defender = deserializePet(snapshot.defender);

    // Equipment totals come from the frozen snapshot, not from the catalog: the fight has
    // to use the modifiers that were written down at acceptance, so unequipping since then
    // changes nothing (roadmap §4).
    const outcome = simulate(
        attacker.dna,
        attacker.rarity,
        attacker.level,
        attacker.skill,
        defender.dna,
        defender.rarity,
        defender.level,
        defender.skill,
        BigInt(battle.seed),
        ruleset.skillConfig,
        bonusFromEquipment(attacker.equipment),
        bonusFromEquipment(defender.equipment),
    );

    const progression = computeProgression(
        { ...snapshot, attacker, defender },
        outcome.result.firstWins,
        { maxLevel: ruleset.maxLevel },
    );
    const combatLogHash = hashCombatLog(outcome);

    const patch: Prisma.BattleLedgerUncheckedUpdateInput = {
        attackerWon: outcome.result.firstWins,
        rounds: outcome.result.rounds,
        winnerHpRemaining: outcome.result.winnerHpRemaining,
        combatLog: serializeBigints(outcome.log),
        combatLogHash,
        progression: serializeBigints(progression),
    };

    await applyTransition({
        battleId: battle.battleId,
        from: BattleState.seeded,
        to: BattleState.computed,
        patch,
        outbox: [{ battleId: battle.battleId, topic: OUTBOX_TOPICS.verify }],
    });
    notifyBattleRoomIfPresent(battle.roomId, { type: 'battle-updated', battleId: battle.battleId, state: BattleState.computed });
    await completeOutbox(message.id, new Date(nowSeconds * 1000));
}

/** As stored: JSON, so the item type arrives as a decimal string. */
export type SnapshotEquipment = {
    slot: number;
    itemType: string | bigint;
    hp: number;
    atk: number;
    def: number;
    int: number;
    mdef: number;
}[];

/** The snapshot is stored as JSON, where bigint fields round-trip as decimal strings. */
function deserializePet(pet: {
    petId: string | bigint;
    owner: string;
    dna: string | bigint;
    rarity: number;
    level: number;
    skill: number;
    xp: number;
    lastOpponentId: string | bigint;
    streak: number;
    readyAt: number;
    sourceVersion: string | bigint;
    equipment?: SnapshotEquipment;
}) {
    return {
        petId: BigInt(pet.petId),
        owner: pet.owner,
        dna: BigInt(pet.dna),
        rarity: pet.rarity,
        level: pet.level,
        skill: pet.skill,
        xp: pet.xp,
        lastOpponentId: BigInt(pet.lastOpponentId),
        streak: pet.streak,
        readyAt: pet.readyAt,
        sourceVersion: BigInt(pet.sourceVersion),
        // Widened back to bigint: JSON storage round-trips the item type as a decimal
        // string, and the protocol's validator wants the number it was written as.
        ...(pet.equipment && {
            equipment: pet.equipment.map((entry) => ({ ...entry, itemType: BigInt(entry.itemType) })),
        }),
    };
}

function serializeBigints<T>(value: T): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)));
}
