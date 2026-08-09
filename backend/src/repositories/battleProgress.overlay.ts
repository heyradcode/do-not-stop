import { chainFamily, type ChainId } from '@cryptopets/protocol';

import { prisma } from '@config/prisma';
import { servedChainIds, servedDeploymentId } from '@features/battle/ledger/domain';
import type { RosterPet } from './roster.repository';
import type { Chain } from '@typings/chain';

/**
 * Overlays backend battle progression onto indexed chain state, for display.
 *
 * `pet_roster` is what the chain says. Since battles stopped settling on chain (§L Phase
 * 6) its `winCount`/`lossCount` are frozen at whatever the retired path left behind,
 * while the real record accumulates in `pet_battle_progress`. Level and xp are NOT
 * frozen: `train()` and `levelUp()` retired with nothing — they are live, paid actions
 * that still raise both. Reading either table alone is wrong: the roster misses every
 * backend battle, and progress rows only exist for pets that have fought at all.
 *
 * So: a pet with a progress row shows its backend progression; a pet without one shows
 * chain truth. That is not a fallback but the same rule stated twice — a progress row is
 * seeded from the pet's on-chain level the first time it fights (see
 * `battle-ledger/snapshot.builder.ts`), so the two agree at the moment the row appears.
 *
 * Two stats merge instead of choosing a side, because both systems keep writing them:
 * `readyAt` takes the *later* of the two (independent locks with different owners —
 * breeding still writes the on-chain one, battles write the backend one — and a pet is
 * only available when neither is holding it), and `level` takes the *greater* (backend
 * battles raise the row, paid on-chain train/level-up raise the roster, and both are
 * monotone, so the max is the only reading that loses neither).
 *
 * This is deliberately not done in `roster.repository.ts`. That layer is the projection
 * of chain state, and two callers need it to stay exactly that: `snapshot.builder.ts`
 * seeds a pet's first progress row from its on-chain level, and `intent.service.ts`
 * checks ownership. Merging in the repository would feed overlaid progression back into
 * the thing that produced it.
 */

/** The `pet_battle_progress` columns that shadow a roster row. */
export interface ProgressRow {
    petId: string;
    level: number;
    xp: number;
    winCount: number;
    lossCount: number;
    readyAt: bigint;
}

/**
 * Applies one pet's progression. Pure, so the merge rule is testable without a database.
 * `progress` being undefined means the pet has never fought a backend battle.
 */
export function overlayRosterPet(pet: RosterPet, progress: ProgressRow | undefined): RosterPet {
    if (!progress) {
        return pet;
    }
    return {
        ...pet,
        // The greater of the two, for the same reason readyAt takes the later: battles
        // stopped writing chain level (§L Phase 6), but train() and levelUp() did not
        // retire — they are live, paid actions that still raise it, and preferring the
        // row outright would erase upgrades the owner paid real fees for. Win/loss stay
        // row-only (nothing on chain writes them any more). Chain xp is also still
        // written by train(), but is deliberately NOT merged: xp counts toward the
        // threshold of the level it was earned at, so comparing it across the two
        // systems compares incommensurate numbers — the level jump it produces is the
        // part that must survive, and the max above carries it.
        level: progress.level > pet.level ? progress.level : pet.level,
        xp: progress.xp,
        winCount: progress.winCount,
        lossCount: progress.lossCount,
        readyAt: progress.readyAt > pet.readyAt ? progress.readyAt : pet.readyAt,
    };
}

/**
 * The served `ChainId` for a roster chain family, or null if this deployment serves none.
 *
 * `pet_roster` is keyed by family (`evm`), `pet_battle_progress` by the specific chain
 * (`eip155:84532`), because one deployment can serve several chains of a family whose
 * pet-id namespaces are unrelated. Returning null when the family is unserved is correct
 * rather than defensive: there is no progression to show for a chain this process does
 * not run battles for.
 */
export function servedChainIdForFamily(chain: Chain): ChainId | null {
    const matches = servedChainIds().filter((chainId) => chainFamily(chainId) === chain);
    return matches.length === 1 ? (matches[0] ?? null) : null;
}

/**
 * Overlays progression onto a batch of pets in one query.
 *
 * Returns the input unchanged when the family is unserved or ambiguous — see
 * `servedChainIdForFamily`. Note that mixing chains in one call is not supported; every
 * pet is expected to come from a single-chain read, which is what every caller does.
 */
export async function withBattleProgress(chain: Chain, pets: RosterPet[]): Promise<RosterPet[]> {
    if (pets.length === 0) {
        return pets;
    }

    const chainId = servedChainIdForFamily(chain);
    if (!chainId) {
        return pets;
    }

    const rows = await fetchProgress(chainId, pets.map((pet) => pet.petId));
    const byPetId = new Map(rows.map((row) => [row.petId, row]));
    return pets.map((pet) => overlayRosterPet(pet, byPetId.get(pet.petId)));
}

/**
 * The progression rows themselves, for pets the client read straight from the chain and
 * therefore has to merge itself (a player's own pet list). Pets with no row are simply
 * absent from the result — see the GraphQL field's own note on why that is not a zero.
 */
export async function findBattleProgress(chain: Chain, petIds: string[]): Promise<ProgressRow[]> {
    if (petIds.length === 0) {
        return [];
    }
    const chainId = servedChainIdForFamily(chain);
    return chainId ? fetchProgress(chainId, petIds) : [];
}

function fetchProgress(chainId: ChainId, petIds: string[]): Promise<ProgressRow[]> {
    return prisma.petBattleProgress.findMany({
        where: { chainId, deploymentId: servedDeploymentId(), petId: { in: petIds } },
        select: { petId: true, level: true, xp: true, winCount: true, lossCount: true, readyAt: true },
    });
}
