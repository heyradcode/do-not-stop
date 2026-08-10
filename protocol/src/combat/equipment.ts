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
const U16_MAX_NUMBER = 65535;

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
 *
 * Saturating at each step, matching the Go port's `SumBonuses` exactly. The final
 * attribute is the same either way, since `applyBonus` clamps at the same ceiling and
 * attributes are non-negative, so this is not what keeps the two engines agreeing.
 *
 * What it keeps working is the wire between them. §F sends this total to indexer-go as a
 * `uint32`, and `bonusFromProto` range-checks it rather than truncating: a total past
 * 65535 came back as an RPC error, which `verify.worker` correctly reads as "could not
 * check" rather than "disagreed", so the battle retried until it dead-lettered. Clamping
 * here means a value that cannot change the outcome cannot stall the pipeline either.
 * Unreachable with shipped content (`MAX_STAT_BONUS` is 500 across three slots), which is
 * why it is a guardrail rather than a fix.
 */
export function sumBonuses(items: readonly AttrBonus[]): AttrBonus {
    const total: AttrBonus = { ...NO_BONUS };
    for (const item of items) {
        total.hp = addClamped(total.hp, item.hp);
        total.atk = addClamped(total.atk, item.atk);
        total.def = addClamped(total.def, item.def);
        total.int = addClamped(total.int, item.int);
        total.mdef = addClamped(total.mdef, item.mdef);
    }
    return total;
}

/**
 * Totals a snapshot's equipment list, treating an absent list as ungeared.
 *
 * The one summation every replaying consumer shares. It exists because the alternative was
 * each of them writing their own: the backend totalling the snapshot to run a fight, and
 * the verifier totalling it again to re-run that fight. Two implementations of the same
 * addition is a divergence waiting to be discovered as an unexplained replay mismatch,
 * where the arithmetic is the last thing anyone would suspect.
 *
 * Note this is *not* the Go port's situation. That one is independent on purpose (§F), and
 * its whole value is that it can disagree. A verifier that reproduces a fight is the
 * opposite case: it has to agree exactly, so it uses the canonical code.
 *
 * Accepts anything carrying the five attribute fields, so a caller can pass entries that
 * also hold a slot and an item type without stripping them first.
 */
export function bonusFromEquipment(items: readonly AttrBonus[] | undefined): AttrBonus {
    return items === undefined ? { ...NO_BONUS } : sumBonuses(items);
}

function clampU16(value: bigint): bigint {
    return value > U16_MAX ? U16_MAX : value;
}

/** Mirrors the Go port's `addClamped`: saturate at the ceiling rather than run past it. */
function addClamped(a: number, b: number): number {
    const sum = a + b;
    return sum > U16_MAX_NUMBER ? U16_MAX_NUMBER : sum;
}
