import { prisma } from '@config/prisma';
import type { Prisma } from '@generated/prisma/client';
import type { Chain } from '@typings/chain';

/**
 * Data-access layer for `battle_history`, the record of settled battles that the dialogue
 * service reads for head-to-head / recent-form rivalry context.
 *
 * Rows come from the signed receipt now, written by the battle worker in the same
 * transaction as the receipt itself (§L Phase 6). Before that they came from the indexer,
 * decoding on-chain settle events; that path is gone with on-chain battles, and the
 * indexer no longer writes here at all.
 *
 * `foughtAt` is unix **seconds**. Rows written by the dialogue client-report path before
 * this change stored `Date.now()` milliseconds, so any such row sorts far in the future
 * against a receipt-written one — relevant only to `getRecentForm`'s ordering, and only
 * for pre-existing rows.
 */

/** Head-to-head summary between two specific pets. */
export interface HeadToHead {
    total: number;
    winsByPet: Record<string, number>;
}

/** A pet's recent results, most recent first. */
export interface RecentForm {
    total: number;
    wins: number;
    losses: number;
}

/** What a signed receipt contributes to the record of a settled battle. */
export interface ReceiptBattleRecord {
    chain: Chain;
    battleId: string;
    attacker: string;
    defender: string;
    attackerWon: boolean;
    /** Unix seconds, from the receipt's own `createdAt`. */
    foughtAt: number;
    seed: string;
    rounds: number;
    winnerHpRemaining: number;
    /** XP awarded to each pet, from the receipt's progression delta. */
    attackerXp: number;
    defenderXp: number;
}

/**
 * Records a settled battle from its receipt, on the caller's transaction.
 *
 * Takes a `Prisma.TransactionClient` rather than reaching for the global client so this
 * commits with the receipt that produced it: a battle can never end up in the history
 * without its receipt, or the reverse.
 *
 * Idempotent by (chain, battleId). A receipt is written once, but the outbox that drives
 * this delivers at least once, so a replay must not fail or double-count.
 */
export async function recordBattleFromReceipt(
    tx: Prisma.TransactionClient,
    rec: ReceiptBattleRecord,
): Promise<void> {
    // Winner/loser as absolute pet ids, not roles: head-to-head tallies have to stay
    // correct when the same two pets meet again with the roles swapped.
    const winnerPetId = rec.attackerWon ? rec.attacker : rec.defender;
    const loserPetId = rec.attackerWon ? rec.defender : rec.attacker;
    const data = {
        chain: rec.chain,
        battleId: rec.battleId,
        attacker: rec.attacker,
        defender: rec.defender,
        winnerPetId,
        loserPetId,
        seed: rec.seed,
        rounds: rec.rounds,
        winnerHpRemaining: rec.winnerHpRemaining,
        xpWin: rec.attackerWon ? rec.attackerXp : rec.defenderXp,
        xpLoss: rec.attackerWon ? rec.defenderXp : rec.attackerXp,
        foughtAt: BigInt(rec.foughtAt),
    };

    await tx.battleHistory.upsert({
        where: { chain_battleId: { chain: rec.chain, battleId: rec.battleId } },
        create: data,
        update: data,
    });
}

/** The recorded winner's pet id, or null when the battle is not on record. */
export async function getSettledWinner(chain: Chain, battleId: string): Promise<string | null> {
    const row = await prisma.battleHistory.findUnique({
        where: { chain_battleId: { chain, battleId } },
        select: { winnerPetId: true },
    });
    return row?.winnerPetId ?? null;
}

/** How the fight went, for the result prompt. Null when the battle is not on record. */
export async function getBattleSummary(
    chain: Chain,
    battleId: string,
): Promise<{ rounds: number; winnerHpRemaining: number; xpWin: number; xpLoss: number } | null> {
    return prisma.battleHistory.findUnique({
        where: { chain_battleId: { chain, battleId } },
        select: { rounds: true, winnerHpRemaining: true, xpWin: true, xpLoss: true },
    });
}

/**
 * Prior meetings between two pets, optionally excluding the current battle.
 * `winnerPetId` makes the tally correct even when the pets swap attacker/
 * defender roles across battles.
 */
export async function getHeadToHead(
    chain: Chain,
    petA: string,
    petB: string,
    excludeBattleId?: string,
): Promise<HeadToHead> {
    const rows = await prisma.battleHistory.findMany({
        where: {
            chain,
            OR: [
                { attacker: petA, defender: petB },
                { attacker: petB, defender: petA },
            ],
            ...(excludeBattleId ? { battleId: { not: excludeBattleId } } : {}),
        },
        select: { winnerPetId: true },
    });

    const winsByPet: Record<string, number> = { [petA]: 0, [petB]: 0 };
    for (const row of rows) {
        if (row.winnerPetId in winsByPet) {
            winsByPet[row.winnerPetId] = (winsByPet[row.winnerPetId] ?? 0) + 1;
        }
    }
    return { total: rows.length, winsByPet };
}

/** A pet's most recent results (across all opponents). */
export async function getRecentForm(
    chain: Chain,
    petId: string,
    limit = 5,
    excludeBattleId?: string,
): Promise<RecentForm> {
    const rows = await prisma.battleHistory.findMany({
        where: {
            chain,
            OR: [{ attacker: petId }, { defender: petId }],
            ...(excludeBattleId ? { battleId: { not: excludeBattleId } } : {}),
        },
        orderBy: { foughtAt: 'desc' },
        take: limit,
        select: { winnerPetId: true },
    });

    const wins = rows.filter((r) => r.winnerPetId === petId).length;
    return { total: rows.length, wins, losses: rows.length - wins };
}
