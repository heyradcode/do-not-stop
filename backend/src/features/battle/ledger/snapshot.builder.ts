import { chainFamily, type ChainId, type EquipEntry, type PetSnapshot } from '@cryptopets/protocol';

import { prisma } from '@config/prisma';
import { getPetEquipment } from '@features/inventory';

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

    // Independent: `resolveEquipment` needs only the family and the pet id, both already in
    // hand, and reads neither the roster nor the progress row. Serial, these were two extra
    // round trips on the accept path — and accept builds two snapshots.
    const [progress, equipment] = await Promise.all([
        getOrInitProgress(chainId, petId, {
            level: roster.level,
            winCount: roster.winCount,
            lossCount: roster.lossCount,
        }),
        resolveEquipment(family, petId),
    ]);

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
        // Omitted rather than empty for an ungeared pet, matching what
        // `assertPetSnapshot` normalizes to. It encodes the same either way, and it keeps
        // an ungeared snapshot's stored JSON identical to what it was before equipment
        // existed, so a diff of stored rows shows only the pets that actually wear
        // something.
        ...(equipment.length > 0 && { equipment }),
    };
}

/**
 * Freezes what a pet is wearing, with each item's modifier already resolved (roadmap §4).
 *
 * Resolved here rather than referenced, because the snapshot is the photo: unequipping
 * after acceptance must not change a committed fight, exactly as a level-up between
 * acceptance and settlement must not. Storing the item id alone would leave the fight
 * depending on a row anyone can still edit.
 *
 * The equip state comes from `pet_equipment`, which only indexer-go writes from the chain,
 * so what is frozen is what the chain said at a version the snapshot records. An outsider
 * can therefore check the gear as well as the numbers.
 *
 * An equipped item with no catalog effect contributes nothing and is left out entirely.
 * Including it with zeroes would put an entry in the receipt claiming an item was worn and
 * did nothing, which reads as a bug rather than as a fact.
 */
async function resolveEquipment(family: string, petId: string): Promise<EquipEntry[]> {
    const equipped = await getPetEquipment(family, petId);
    const entries: EquipEntry[] = [];

    for (const { slot, item } of equipped) {
        if (item.effect?.kind !== 'stat_bonus') {
            continue;
        }
        entries.push({
            slot,
            itemType: BigInt(item.itemType),
            hp: item.effect.hp,
            atk: item.effect.atk,
            def: item.effect.def,
            int: item.effect.int,
            mdef: item.effect.mdef,
        });
    }

    // Ascending by slot, which the protocol requires: the order is part of the snapshot
    // digest, and `assertPetSnapshot` refuses to sort silently so an upstream bug that
    // produced two weapons surfaces instead of being tidied away.
    return entries.sort((a, b) => a.slot - b.slot);
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
        // Adopt a higher on-chain level before fighting. Battles stopped writing chain
        // level (§L Phase 6), but paid train()/levelUp() did not retire, so the roster
        // can move ahead of a row seeded at first battle — and a snapshot built from the
        // stale row would have the pet fight as if those purchases never happened.
        // Persisted (not just read as a max) because this level goes into the signed
        // snapshot, and the receipt's progression must replay from the same number the
        // fight was computed at. Backend xp is kept: it counts toward the next level's
        // threshold, which only grows with the adopted level, so no clamp is needed.
        // The write is idempotent under a concurrent-accept race — both setters
        // compute the same max from the same roster row.
        if (seed.level > existing.level) {
            return prisma.petBattleProgress.update({ where: key, data: { level: seed.level } });
        }
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
