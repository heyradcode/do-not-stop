import { prisma } from '@config/prisma';
import type { Chain } from '@typings/chain';

/**
 * Data-access layer for `battle_history`. The indexer writes settled battles
 * here (authoritative, from on-chain events); the dialogue service reads
 * head-to-head / recent form to give the LLM rivalry context.
 */

export interface BattleRecord {
    chain: Chain;
    battleId: string;
    attacker: string;
    defender: string;
    winnerPetId: string;
    foughtAt: bigint;
}

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

/** Idempotent insert keyed by (chain, battleId) — safe to replay events. */
export async function recordBattle(rec: BattleRecord): Promise<void> {
    await prisma.battleHistory.upsert({
        where: { chain_battleId: { chain: rec.chain, battleId: rec.battleId } },
        create: rec,
        update: rec,
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
