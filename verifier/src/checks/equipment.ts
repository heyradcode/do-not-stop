import type { BattleReceipt, EquipEntry, Ruleset } from '@cryptopets/protocol';

import type { CheckResult } from './types';

/**
 * Confirms each pet's frozen modifiers are the ones its items are supposed to grant
 * (roadmap §4).
 *
 * The combat replay proves a fight followed from the numbers in the receipt. It cannot
 * prove those numbers were *right*: a receipt that quietly gave one pet +50 ATK from a
 * dagger replays perfectly, because the inflated bonus is the very thing being replayed
 * against. Self-consistent is not the same as honest.
 *
 * This closes that gap using two fields that exist for no other reason. The snapshot
 * records each item's `itemType` alongside its resolved bonus, and the ruleset the receipt
 * names publishes what every combat-affecting item does. So the declared effect and the
 * applied effect can be compared, by anyone, years later, from the receipt and its bundle
 * alone.
 *
 * What it still does not prove is that the pet *owned* the item. That is a claim about
 * chain state at `sourceVersion`, which this package deliberately cannot read — it has no
 * network access, by design. A verifier that wants that checks `ItemCore.equipmentOf` at
 * the recorded version itself; this narrows the remaining trust to exactly that one
 * question (threat T13).
 */
export function checkEquipment(receipt: BattleReceipt, ruleset: Ruleset): CheckResult {
    const check = 'equipment';
    const declared = new Map((ruleset.itemCatalog ?? []).map((item) => [item.itemType, item]));

    const mismatches: string[] = [];
    for (const [role, pet] of [['attacker', receipt.snapshot.attacker], ['defender', receipt.snapshot.defender]] as const) {
        for (const entry of pet.equipment ?? []) {
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

    return mismatches.length === 0 ? { check, ok: true } : { check, ok: false, detail: mismatches.join('; ') };
}

/**
 * Totals a pet's frozen equipment into the bonus the engine consumes.
 *
 * The snapshot's numbers, not the catalog's, and the distinction is the point: the replay
 * has to reproduce the fight that happened, so it runs on what was applied.
 * `checkEquipment` is what says whether that was correct, and it reports separately, so a
 * mispriced item shows up as a mispriced item rather than as an unexplained replay
 * mismatch.
 */
export function equipmentBonus(equipment: readonly EquipEntry[] | undefined) {
    const total = { hp: 0, atk: 0, def: 0, int: 0, mdef: 0 };
    for (const entry of equipment ?? []) {
        total.hp += entry.hp;
        total.atk += entry.atk;
        total.def += entry.def;
        total.int += entry.int;
        total.mdef += entry.mdef;
    }
    return total;
}
