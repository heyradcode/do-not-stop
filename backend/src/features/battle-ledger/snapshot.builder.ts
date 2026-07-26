import { chainFamily, type ChainId, type PetSnapshot } from '@cryptopets/protocol';

import { prisma } from '@config/prisma';

import { servedDeploymentId } from './domain';

/**
 * Builds the frozen "photo" for one pet at acceptance (§C).
 *
 * Two sources are read and merged, and the split is deliberate:
 *
 * - `pet_roster` is the indexed projection of on-chain state (owner, DNA, rarity, level,
 *   species), keyed by chain *family* (`evm` | `solana`). It is never written by backend
 *   battles, so it stays exactly what the chain guarantees.
 * - `pet_battle_progress` is the backend-only progression state (§C): off-chain level, XP,
 *   same-opponent streak, backend cooldown. Kept in a separate table so mixing the two never
 *   becomes possible by accident. It is keyed by the specific protocol `ChainId` (e.g.
 *   `eip155:84532`, not just `evm`), because one deployment can serve more than one chain of
 *   the same family, and the family alone would not disambiguate their pet-id namespaces.
 *
 * A pet with no progress row yet is initialized from its on-chain level (a level-40 pet's
 * first backend battle starts at level 40, not level 1), XP zeroed (the backend threshold
 * curve starts its own cycle rather than inheriting a partial on-chain counter that may not
 * even use the same formula), and no opponent history.
 */

const SKILL_ARCHETYPES = 8;

export async function buildPetSnapshot(chainId: ChainId, petId: string): Promise<PetSnapshot | null> {
    const family = chainFamily(chainId);
    const roster = await prisma.petRoster.findUnique({ where: { chain_petId: { chain: family, petId } } });
    if (!roster) {
        return null;
    }

    const progress = await getOrInitProgress(chainId, petId, {
        level: roster.level,
        winCount: roster.winCount,
        lossCount: roster.lossCount,
    });

    return {
        petId: BigInt(petId),
        owner: roster.owner,
        dna: BigInt(roster.dna),
        rarity: roster.rarity,
        level: progress.level,
        skill: roster.speciesId % SKILL_ARCHETYPES,
        xp: progress.xp,
        lastOpponentId: BigInt(progress.lastOpponentId),
        streak: progress.streak,
        readyAt: Number(progress.readyAt),
        sourceVersion: roster.lastVersion,
    };
}

/**
 * Reads a pet's backend progression, creating the row on first use.
 *
 * The create is best-effort under a race: two concurrent first-battles for the same pet can
 * both miss the row and both attempt to create it. Whichever loses the unique-constraint race
 * simply re-reads, which is safe because the initial values are a pure function of the
 * on-chain state passed in, not of anything the loser would have computed differently.
 */
async function getOrInitProgress(
    chainId: ChainId,
    petId: string,
    seed: { level: number; winCount: number; lossCount: number },
) {
    const deploymentId = servedDeploymentId();
    const key = { chainId_deploymentId_petId: { chainId, deploymentId, petId } };

    const existing = await prisma.petBattleProgress.findUnique({ where: key });
    if (existing) {
        return existing;
    }

    try {
        return await prisma.petBattleProgress.create({
            data: {
                chainId,
                deploymentId,
                petId,
                level: seed.level,
                xp: 0,
                winCount: seed.winCount,
                lossCount: seed.lossCount,
            },
        });
    } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') {
            throw error;
        }
        const created = await prisma.petBattleProgress.findUnique({ where: key });
        if (!created) {
            throw new Error(`pet_battle_progress for ${chainId}/${petId} vanished after a create race`);
        }
        return created;
    }
}
