import type { EquipEntry } from '../snapshot/types';

import type { Ruleset } from './types';

/**
 * Holds frozen equipment to what the ruleset's catalog declares (roadmap §4, threat T13).
 *
 * A combat replay proves a fight followed from the numbers in the snapshot. It cannot
 * prove those numbers were the right ones: a snapshot granting +50 ATK from a 4-ATK dagger
 * replays perfectly, because the inflated bonus is the very thing being replayed against.
 * Self-consistent is not the same as honest, and this is what closes the difference.
 *
 * Two fields exist for no other purpose. The snapshot records each item's `itemType`
 * beside its resolved bonus, and the ruleset publishes what every combat-affecting item
 * does, so the declared effect and the applied one can be compared by anyone, from the
 * receipt and its bundle alone.
 *
 * Lives here rather than in the verifier because it now has two callers with very
 * different jobs: the verifier reporting on a receipt after the fact, and the backend
 * refusing a battle before it starts. Two implementations of one comparison would diverge,
 * and the symptom would be a battle that accepts and then fails to verify, with the
 * comparison itself the last thing anyone suspects.
 *
 * What it does not prove is that the pet *owned* the item. That is a claim about chain
 * state at `sourceVersion`, which this package deliberately cannot read; a caller wanting
 * it checks `ItemCore.equipmentOf` at the recorded version itself.
 */
export interface EquipmentBearer {
    /** Label used in the mismatch text, e.g. `attacker`. */
    role: string;
    /**
     * Spelled `| undefined` as well as optional, because this package builds under
     * `exactOptionalPropertyTypes`: both callers read the field straight off a
     * `PetSnapshot`, where an ungeared pet has it present and undefined rather than absent.
     */
    equipment?: readonly EquipEntry[] | undefined;
}

/** Every disagreement between what was worn and what the ruleset prices, as prose. */
export function findEquipmentMismatches(bearers: readonly EquipmentBearer[], ruleset: Ruleset): string[] {
    const declared = new Map((ruleset.itemCatalog ?? []).map((item) => [item.itemType, item]));
    const mismatches: string[] = [];

    for (const { role, equipment } of bearers) {
        for (const entry of equipment ?? []) {
            const item = declared.get(entry.itemType);
            if (!item) {
                // An item the ruleset never priced. The fight used a modifier from
                // nowhere, which is unauditable rather than merely unusual.
                mismatches.push(`${role} slot ${entry.slot}: item ${entry.itemType} is not in the ruleset's catalog`);
                continue;
            }
            if (item.slot !== entry.slot) {
                mismatches.push(
                    `${role} item ${entry.itemType}: worn in slot ${entry.slot}, catalog says slot ${item.slot}`,
                );
            }
            for (const field of ['hp', 'atk', 'def', 'int', 'mdef'] as const) {
                if (entry[field] !== item[field]) {
                    mismatches.push(
                        `${role} item ${entry.itemType}: ${field} applied ${entry[field]}, catalog declares ${item[field]}`,
                    );
                }
            }
        }
    }

    return mismatches;
}
