import { type Attrs } from './dna';

/**
 * Equipment's effect on a pet's attributes (roadmap §4).
 *
 * Lives in `combat/` and takes no dependency on `snapshot/`, so the engine stays a
 * function of plain numbers. The caller resolves a snapshot's equipment list into one of
 * these and hands it over; the engine never learns what an item is.
 *
 * Flat and additive, which is what §4 recommends and what keeps the modifier space small
 * enough for two independent ports to stay in step. A multiplicative or conditional
 * system (set bonuses, Dota-style) multiplies the vector matrix combinatorially and is a
 * v2 of the equipment model, not a field added here.
 */
export interface AttrBonus {
    hp: number;
    atk: number;
    def: number;
    int: number;
    mdef: number;
}

/** An ungeared pet. The default everywhere, so an unequipped fight is unchanged. */
export const NO_BONUS: AttrBonus = { hp: 0, atk: 0, def: 0, int: 0, mdef: 0 };

const U16_MAX = 65535n;

/**
 * Adds a bonus to extracted attributes, in place.
 *
 * **Clamped, not truncated**, and this is the one place in the engine where those differ
 * on purpose. Everything else here mirrors Solidity's `uint16` cast, which wraps; a
 * wrapping *addition* would turn a well-geared pet into a nearly dead one at 65536, which
 * is the opposite of what the item says it does. Base attributes cannot reach that on
 * their own (a level-100 legendary lands in the low hundreds), so the clamp is a
 * guardrail rather than a live code path — but it has to be a clamp, and the Go port has
 * to clamp identically.
 *
 * `element` is untouched. No item changes a pet's element, and one that did would be
 * changing which matchups it wins rather than how hard it hits.
 */
export function applyBonus(attrs: Attrs, bonus: AttrBonus): void {
    attrs.hp = clampU16(attrs.hp + BigInt(bonus.hp));
    attrs.atk = clampU16(attrs.atk + BigInt(bonus.atk));
    attrs.def = clampU16(attrs.def + BigInt(bonus.def));
    attrs.int = clampU16(attrs.int + BigInt(bonus.int));
    attrs.mdef = clampU16(attrs.mdef + BigInt(bonus.mdef));
}

/**
 * Totals several equipped items into one bonus.
 *
 * Order-independent by construction: addition commutes, so the caller does not have to
 * sort, unlike the snapshot encoding where order is part of the digest.
 */
export function sumBonuses(items: readonly AttrBonus[]): AttrBonus {
    const total: AttrBonus = { ...NO_BONUS };
    for (const item of items) {
        total.hp += item.hp;
        total.atk += item.atk;
        total.def += item.def;
        total.int += item.int;
        total.mdef += item.mdef;
    }
    return total;
}

function clampU16(value: bigint): bigint {
    return value > U16_MAX ? U16_MAX : value;
}
