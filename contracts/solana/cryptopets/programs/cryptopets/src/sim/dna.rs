//! Canonical DNA → attribute derivation (plan §3.1). Mirrors `contracts/ethereum/src/DnaLib.sol`
//! bit-for-bit; both sides must stay in sync for cross-chain golden-vector parity (§7).
//!
//! Digit-pair layout (pair index, digits, LSB-first):
//!   0        element gene  -> element = pair0 % 6
//!   1        hpGene        (0-99)
//!   2        atkGene       (0-99)
//!   3        defGene       (0-99)
//!   4        intGene       (0-99; also drives initiative, crits)
//!   5        mdefGene      (0-99)
//!   6-7      cosmetic      (appearance, species index - unused by combat)
//!
//! Effective stats (integer math, must be bit-identical cross-chain, plan §3.1):
//!   HP   = 100 + 4*hpGene  + 6*level
//!   ATK  = 10  + atkGene   + 2*level
//!   DEF  = 10  + defGene   + 2*level
//!   INT  = 10  + intGene   + 2*level   (initiative + magic + crits)
//!   MDEF = 10  + mdefGene  + 2*level
//! All multiplied by rarity bonus x(100 + 5*(rarity-1)) / 100.
//!
//! Element wheel (plan §3.2): 0->1->2->3->4->5->0.
//! Striking the *next* element in the cycle: x115/100.
//! Striking the *previous*: x85/100. All other matchups: x100/100.

/// Level-scaled, rarity-multiplied battle attributes derived from a pet's DNA.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Attrs {
    pub hp: u16,
    pub atk: u16,
    pub def: u16,
    pub intl: u16,
    pub mdef: u16,
    pub element: u8,
}

/// Returns the two-digit value at `pair_idx` (0-indexed, LSB-first), i.e. `(dna / 100^pair_idx) % 100`.
pub fn digit_pair(dna: u64, pair_idx: u32) -> u64 {
    (dna / 10u64.pow(pair_idx * 2)) % 100
}

/// Derives level-scaled, rarity-multiplied battle attributes from `dna`.
pub fn extract(dna: u64, rarity: u8, level: u16) -> Attrs {
    let elem = digit_pair(dna, 0) % 6;
    let hp_gene = digit_pair(dna, 1);
    let atk_gene = digit_pair(dna, 2);
    let def_gene = digit_pair(dna, 3);
    let int_gene = digit_pair(dna, 4);
    let mdef_gene = digit_pair(dna, 5);

    let mul = 100 + (u64::from(rarity.max(1)) - 1) * 5;
    let lv = u64::from(level);

    Attrs {
        hp: ((100 + 4 * hp_gene + 6 * lv) * mul / 100) as u16,
        atk: ((10 + atk_gene + 2 * lv) * mul / 100) as u16,
        def: ((10 + def_gene + 2 * lv) * mul / 100) as u16,
        intl: ((10 + int_gene + 2 * lv) * mul / 100) as u16,
        mdef: ((10 + mdef_gene + 2 * lv) * mul / 100) as u16,
        element: elem as u8,
    }
}

/// Element advantage multiplier (out of 100) for a strike from `attacker` onto `defender`.
/// Returns 115 (advantage), 85 (disadvantage), or 100 (neutral/same).
pub fn element_mod(attacker: u8, defender: u8) -> u64 {
    if attacker == defender {
        return 100;
    }
    if defender == (attacker + 1) % 6 {
        return 115; // attacker hits its next -> advantage
    }
    if attacker == (defender + 1) % 6 {
        return 85; // defender is attacker's next -> disadvantage
    }
    100 // non-adjacent in the 6-cycle -> neutral
}

/// Resolves a pet's species id from its DNA cosmetic digit-pair and its rarity tier's pool
/// size (plan §3.7, mirrors `PetCoreV1._resolveSpecies`). `pool_sizes` is indexed by
/// `rarity - 1` for rarity tiers 1..=5 (clamped defensively for out-of-range input); a pool
/// size of `0` means "no species" (id `0`). Resolved once at mint/breed time so later pool
/// growth doesn't re-species existing pets.
pub fn resolve_species(dna: u64, rarity: u8, pool_sizes: &[u8; 5]) -> u16 {
    let idx = rarity.saturating_sub(1).min(4) as usize;
    let pool_size = pool_sizes[idx];
    if pool_size == 0 {
        return 0;
    }
    (digit_pair(dna, 6) % pool_size as u64) as u16
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn digit_pair_reads_each_two_digit_group_lsb_first() {
        let dna = 807_060_504_030_201u64;
        assert_eq!(digit_pair(dna, 0), 1);
        assert_eq!(digit_pair(dna, 1), 2);
        assert_eq!(digit_pair(dna, 2), 3);
        assert_eq!(digit_pair(dna, 3), 4);
        assert_eq!(digit_pair(dna, 4), 5);
        assert_eq!(digit_pair(dna, 5), 6);
        assert_eq!(digit_pair(dna, 6), 7);
        assert_eq!(digit_pair(dna, 7), 8);
    }

    #[test]
    fn extract_applies_base_formula_at_level_zero_common_rarity() {
        let dna = 807_060_504_030_201u64;
        let a = extract(dna, 1, 0);
        assert_eq!(
            a,
            Attrs {
                hp: 108,
                atk: 13,
                def: 14,
                intl: 15,
                mdef: 16,
                element: 1,
            }
        );
    }

    #[test]
    fn extract_scales_with_level_and_rarity_bonus() {
        let dna = 807_060_504_030_201u64;
        let a = extract(dna, 5, 10);
        assert_eq!(
            a,
            Attrs {
                hp: 201,
                atk: 39,
                def: 40,
                intl: 42,
                mdef: 43,
                element: 1,
            }
        );
    }

    #[test]
    fn element_mod_follows_the_six_element_wheel() {
        assert_eq!(element_mod(0, 0), 100); // same element
        assert_eq!(element_mod(0, 1), 115); // attacker's next -> advantage
        assert_eq!(element_mod(1, 0), 85); // defender's next -> disadvantage
        assert_eq!(element_mod(0, 2), 100); // non-adjacent -> neutral
        assert_eq!(element_mod(5, 0), 115); // wheel wraps 5 -> 0
        assert_eq!(element_mod(0, 5), 85); // wheel wraps 0 -> 5
    }

    #[test]
    fn resolve_species_is_digit_pair_six_mod_pool_size() {
        let dna = 807_060_504_030_201u64; // digit_pair(dna, 6) == 7
        assert_eq!(resolve_species(dna, 1, &[8, 8, 8, 8, 8]), 7);
        // Smaller pool wraps the same digit pair.
        assert_eq!(resolve_species(dna, 1, &[5, 8, 8, 8, 8]), 2);
        // Pool size 0 for the pet's tier means "no species".
        assert_eq!(resolve_species(dna, 1, &[0, 8, 8, 8, 8]), 0);
        // rarity - 1 indexes into pool_sizes.
        assert_eq!(resolve_species(dna, 5, &[8, 8, 8, 8, 3]), 1);
    }
}
