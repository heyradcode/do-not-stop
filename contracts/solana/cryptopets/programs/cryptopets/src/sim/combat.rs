//! Stateless, pure round-based battle simulator (plan §3.3). Mirrors
//! `contracts/ethereum/src/CombatSimV1.sol` move-for-move; both sides must stay in sync for
//! cross-chain golden-vector parity (§7).
//!
//! Round model:
//!   initiative: higher INT acts first each round; tie -> attacker (pet 1).
//!     Shell overrides: always strikes second.
//!     Swift: wins all initiative ties.
//!   strike type per attack: pMagicBps = 10000 * INT / (ATK + INT)
//!     physical: max(1, ATK * 100 / (100 + DEF))
//!     magic:    max(1, INT * 100 / (100 + MDEF))
//!   element modifier +-15% applied to either type.
//!   crit: critBps = min(500 + 25*INT, 3000); multiplier 1.5x.
//!   round cap 30; tie -> higher remaining HP bps; exact tie -> defender (pet 2).
//!   RNG per strike: keccak256(seed || roundIndex || slotOffset), matching EVM's
//!   `keccak256(abi.encodePacked(...))` byte layout so both chains derive identical rolls
//!   from the same 32-byte seed.
//!
//! Skill archetypes (index = speciesId % 8, plan §3.7):
//!   0 Tank      +tankHpMult% HP (pre-battle)
//!   1 Shell     +shellDefMult% DEF; always strikes second
//!   2 Swift     wins initiative ties; +swiftCritBonus bps to crit base
//!   3 Cunning   crit cap raised to cunningCritCap bps (default 4000 = 40%)
//!   4 Fury      +furyDmgMult% damage while own HP < furyHpThreshold bps of start
//!   5 Sage      +sageMdefMult% MDEF; magic strikes ignore element penalty
//!   6 Rebirth   once per battle, survive a killing blow at 1 HP
//!   7 Bloodlust heals bloodlustBps/10000 of physical damage dealt
//!
//! A `skill` value outside `0..=7` (e.g. `NO_SKILL`) opts a pet out of every archetype
//! branch below, for use until species tiers (plan §3.7, v2.1 Phase B) land on Solana.

use solana_keccak_hasher as keccak;

use super::dna::{self, Attrs};

pub const MAX_ROUNDS: u8 = 30;

pub const SKILL_TANK: u8 = 0;
pub const SKILL_SHELL: u8 = 1;
pub const SKILL_SWIFT: u8 = 2;
pub const SKILL_CUNNING: u8 = 3;
pub const SKILL_FURY: u8 = 4;
pub const SKILL_SAGE: u8 = 5;
pub const SKILL_REBIRTH: u8 = 6;
pub const SKILL_BLOODLUST: u8 = 7;

/// Sentinel for "no skill archetype" (any value outside `0..=7` works; this is the canonical one).
pub const NO_SKILL: u8 = 8;

/// Crit formula constants (mirrors `CombatSimV1.sol`):
///   critBps = min(CRIT_BASE + CRIT_PER_INT * INT, CRIT_CAP_DEFAULT)
///   on a hit: damage × CRIT_MULT / 100
const CRIT_BASE: u64 = 500;
const CRIT_PER_INT: u64 = 25;
const CRIT_CAP_DEFAULT: u64 = 3000;
const CRIT_MULT: u64 = 150; // 1.5× as a percentage multiplier

/// Skill balance values (plan §3.7), mirrors `GameConfig`'s `tankHpMult` etc. Defaults match
/// `GameConfig.sol`'s initializers.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SkillConfig {
    pub tank_hp_mult: u16,
    pub shell_def_mult: u16,
    pub swift_crit_bonus: u16,
    pub cunning_crit_cap: u16,
    pub fury_dmg_mult: u16,
    pub fury_hp_threshold: u16,
    pub sage_mdef_mult: u16,
    pub bloodlust_bps: u16,
}

impl Default for SkillConfig {
    fn default() -> Self {
        Self {
            tank_hp_mult: 120,
            shell_def_mult: 125,
            swift_crit_bonus: 50,
            cunning_crit_cap: 4000,
            fury_dmg_mult: 130,
            fury_hp_threshold: 3000,
            sage_mdef_mult: 125,
            bloodlust_bps: 150,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BattleResult {
    pub first_wins: bool,
    pub rounds: u8,
    pub winner_hp_remaining: u16,
}

/// Runs a full battle between pet 1 (dna1/rarity1/level1/skill1) and pet 2, seeded by `seed`
/// (the 32-byte VRF reveal, treated as the big-endian bytes of the EVM `uint256 seed`).
pub fn simulate(
    dna1: u64,
    rarity1: u8,
    level1: u16,
    skill1: u8,
    dna2: u64,
    rarity2: u8,
    level2: u16,
    skill2: u8,
    seed: [u8; 32],
    sc: &SkillConfig,
) -> BattleResult {
    let mut a = dna::extract(dna1, rarity1, level1);
    let mut b = dna::extract(dna2, rarity2, level2);

    // Pre-battle skill modifiers (Tank, Shell, Sage)
    if skill1 == SKILL_TANK {
        a.hp = (a.hp as u32 * sc.tank_hp_mult as u32 / 100) as u16;
    }
    if skill2 == SKILL_TANK {
        b.hp = (b.hp as u32 * sc.tank_hp_mult as u32 / 100) as u16;
    }
    if skill1 == SKILL_SHELL {
        a.def = (a.def as u32 * sc.shell_def_mult as u32 / 100) as u16;
    }
    if skill2 == SKILL_SHELL {
        b.def = (b.def as u32 * sc.shell_def_mult as u32 / 100) as u16;
    }
    if skill1 == SKILL_SAGE {
        a.mdef = (a.mdef as u32 * sc.sage_mdef_mult as u32 / 100) as u16;
    }
    if skill2 == SKILL_SAGE {
        b.mdef = (b.mdef as u32 * sc.sage_mdef_mult as u32 / 100) as u16;
    }

    let mut hp_a = a.hp as u32;
    let mut hp_b = b.hp as u32;
    let start_hp_a = a.hp as u32;
    let start_hp_b = b.hp as u32;

    let elem_ab = dna::element_mod(a.element, b.element); // A attacks B
    let elem_ba = dna::element_mod(b.element, a.element); // B attacks A

    let mut rebirth_used_1 = false;
    let mut rebirth_used_2 = false;

    let mut r: u8 = 0;
    while r < MAX_ROUNDS && hp_a > 0 && hp_b > 0 {
        let rs = round_seed(&seed, r);

        // Initiative (plan §3.3, §3.7)
        let a_first = if skill1 == SKILL_SHELL && skill2 != SKILL_SHELL {
            false // Shell A: A always second
        } else if skill2 == SKILL_SHELL && skill1 != SKILL_SHELL {
            true // Shell B: B always second = A goes first
        } else if a.intl != b.intl {
            a.intl > b.intl
        } else {
            // Tie: Swift wins; both-Swift or no-Swift -> attacker (A) wins
            skill1 == SKILL_SWIFT || skill2 != SKILL_SWIFT
        };

        if a_first {
            let (new_hp_b, heal_a) =
                strike(&a, skill1, hp_a, start_hp_a, b.def, b.mdef, hp_b, elem_ab, &rs, 0, sc);
            hp_b = new_hp_b;
            hp_a = add_heal(hp_a, heal_a, start_hp_a);
            if hp_b == 0 && skill2 == SKILL_REBIRTH && !rebirth_used_2 {
                hp_b = 1;
                rebirth_used_2 = true;
            }
            if hp_b > 0 {
                let (new_hp_a, heal_b) = strike(
                    &b, skill2, hp_b, start_hp_b, a.def, a.mdef, hp_a, elem_ba, &rs, 2, sc,
                );
                hp_a = new_hp_a;
                hp_b = add_heal(hp_b, heal_b, start_hp_b);
                if hp_a == 0 && skill1 == SKILL_REBIRTH && !rebirth_used_1 {
                    hp_a = 1;
                    rebirth_used_1 = true;
                }
            }
        } else {
            let (new_hp_a, heal_b) = strike(
                &b, skill2, hp_b, start_hp_b, a.def, a.mdef, hp_a, elem_ba, &rs, 0, sc,
            );
            hp_a = new_hp_a;
            hp_b = add_heal(hp_b, heal_b, start_hp_b);
            if hp_a == 0 && skill1 == SKILL_REBIRTH && !rebirth_used_1 {
                hp_a = 1;
                rebirth_used_1 = true;
            }
            if hp_a > 0 {
                let (new_hp_b, heal_a) = strike(
                    &a, skill1, hp_a, start_hp_a, b.def, b.mdef, hp_b, elem_ab, &rs, 2, sc,
                );
                hp_b = new_hp_b;
                hp_a = add_heal(hp_a, heal_a, start_hp_a);
                if hp_b == 0 && skill2 == SKILL_REBIRTH && !rebirth_used_2 {
                    hp_b = 1;
                    rebirth_used_2 = true;
                }
            }
        }

        r += 1;
    }

    let first_wins = if hp_a > 0 && hp_b == 0 {
        true
    } else if hp_b > 0 && hp_a == 0 {
        false
    } else {
        let bps_a = hp_a as u64 * 10000 / start_hp_a as u64;
        let bps_b = hp_b as u64 * 10000 / start_hp_b as u64;
        bps_a > bps_b // exact tie -> false -> defender (pet 2) wins
    };

    let winner_hp = if first_wins { hp_a } else { hp_b };

    BattleResult {
        first_wins,
        rounds: r,
        winner_hp_remaining: winner_hp.min(u16::MAX as u32) as u16,
    }
}

/// Executes one strike. Returns `(new_hp_def, atk_heal)` where `atk_heal` is Bloodlust lifesteal.
#[allow(clippy::too_many_arguments)]
fn strike(
    atk: &Attrs,
    atk_skill: u8,
    hp_atk: u32,
    start_hp_atk: u32,
    def_def: u16,
    def_mdef: u16,
    hp_def: u32,
    elem_mult: u64,
    round_seed: &[u8; 32],
    slot_offset: u8,
    sc: &SkillConfig,
) -> (u32, u32) {
    let total = atk.atk as u64 + atk.intl as u64;
    let p_magic_bps = 10000 * atk.intl as u64 / total;
    let type_roll = strike_roll(round_seed, slot_offset);

    let is_magic = type_roll < p_magic_bps;
    let mut dmg: u64 = if is_magic {
        atk.intl as u64 * 100 / (100 + def_mdef as u64)
    } else {
        atk.atk as u64 * 100 / (100 + def_def as u64)
    };
    if dmg == 0 {
        dmg = 1;
    }

    // Element modifier; Sage ignores penalty on magic strikes
    let mut eff_elem = elem_mult;
    if atk_skill == SKILL_SAGE && is_magic && elem_mult < 100 {
        eff_elem = 100;
    }
    dmg = dmg * eff_elem / 100;

    // Fury: +furyDmgMult% while own HP < furyHpThreshold bps of start
    if atk_skill == SKILL_FURY && start_hp_atk > 0 {
        if (hp_atk as u64 * 10000 / start_hp_atk as u64) < sc.fury_hp_threshold as u64 {
            dmg = dmg * sc.fury_dmg_mult as u64 / 100;
        }
    }

    // Crit
    let crit_cap = if atk_skill == SKILL_CUNNING {
        sc.cunning_crit_cap as u64
    } else {
        CRIT_CAP_DEFAULT
    };
    let crit_base = CRIT_BASE + if atk_skill == SKILL_SWIFT { sc.swift_crit_bonus as u64 } else { 0 };
    let mut crit_bps = crit_base + CRIT_PER_INT * atk.intl as u64;
    if crit_bps > crit_cap {
        crit_bps = crit_cap;
    }
    let crit_roll = strike_roll(round_seed, slot_offset + 1);
    if crit_roll < crit_bps {
        dmg = dmg * CRIT_MULT / 100;
    }

    if dmg == 0 {
        dmg = 1;
    }
    let new_hp_def = if hp_def > dmg as u32 { hp_def - dmg as u32 } else { 0 };

    // Bloodlust: heal attacker for bloodlustBps/10000 of physical damage dealt
    let atk_heal = if atk_skill == SKILL_BLOODLUST && !is_magic {
        (dmg * sc.bloodlust_bps as u64 / 10000) as u32
    } else {
        0
    };

    (new_hp_def, atk_heal)
}

/// Safe HP add, capped at `start_hp` (prevents overheal).
fn add_heal(hp: u32, heal: u32, start_hp: u32) -> u32 {
    if heal == 0 {
        return hp;
    }
    let result = hp as u64 + heal as u64;
    if result > start_hp as u64 {
        start_hp
    } else {
        result as u32
    }
}

/// `keccak256(seed || round)`, matching EVM's `keccak256(abi.encodePacked(uint256 seed, uint8 round))`.
/// The output bytes equal what EVM treats as the next `roundSeed` (a `bytes32`/`uint256` is the
/// same 32 bytes either way), so they're reused directly as the next preimage's first 32 bytes.
fn round_seed(seed: &[u8; 32], round: u8) -> [u8; 32] {
    let mut preimage = [0u8; 33];
    preimage[0..32].copy_from_slice(seed);
    preimage[32] = round;
    keccak::hash(&preimage).to_bytes()
}

/// `keccak256(round_seed || slot_offset) % 10000`, matching EVM's
/// `uint256(keccak256(abi.encodePacked(roundSeed, slotOffset))) % 10000`.
fn strike_roll(round_seed: &[u8; 32], slot_offset: u8) -> u64 {
    let mut preimage = [0u8; 33];
    preimage[0..32].copy_from_slice(round_seed);
    preimage[32] = slot_offset;
    let digest = keccak::hash(&preimage).to_bytes();
    be_bytes_mod(&digest, 10_000)
}

/// `uint256(be_bytes) % modulus`, computed byte-by-byte via Horner's method so no 256-bit
/// integer type is needed (`modulus * 256` must fit in `u64`, true for all moduli used here).
fn be_bytes_mod(be_bytes: &[u8; 32], modulus: u64) -> u64 {
    let mut result: u64 = 0;
    for &byte in be_bytes.iter() {
        result = (result * 256 + byte as u64) % modulus;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_heal_caps_at_start_hp() {
        assert_eq!(add_heal(50, 0, 100), 50);
        assert_eq!(add_heal(50, 30, 100), 80);
        assert_eq!(add_heal(50, 100, 100), 100);
        assert_eq!(add_heal(u32::MAX - 1, 10, u32::MAX), u32::MAX);
    }

    #[test]
    fn be_bytes_mod_matches_naive_big_integer_reduction() {
        // 2^256 - 1 (all 0xff) mod 10000.
        let all_ff = [0xffu8; 32];
        // (2^256 - 1) mod 10000 == 9935 (2^256 mod 10000 == 9936, verified via repeated squaring).
        assert_eq!(be_bytes_mod(&all_ff, 10_000), 9935);

        // Zero mod anything is zero.
        let zero = [0u8; 32];
        assert_eq!(be_bytes_mod(&zero, 10_000), 0);

        // A value smaller than the modulus reduces to itself.
        let mut small = [0u8; 32];
        small[31] = 42;
        assert_eq!(be_bytes_mod(&small, 10_000), 42);
    }

    #[test]
    fn simulate_terminates_within_round_cap_and_picks_a_winner() {
        let sc = SkillConfig::default();
        let seed = [7u8; 32];

        let result = simulate(
            807_060_504_030_201,
            3,
            10,
            NO_SKILL,
            102_030_405_060_708,
            2,
            10,
            NO_SKILL,
            seed,
            &sc,
        );

        assert!(result.rounds >= 1 && result.rounds <= MAX_ROUNDS);
        assert!(result.winner_hp_remaining > 0);
    }

    #[test]
    fn simulate_is_deterministic_for_a_fixed_seed() {
        let sc = SkillConfig::default();
        let seed = [42u8; 32];

        let r1 = simulate(123_456_789_012_345, 1, 5, NO_SKILL, 543_210_987_654_321, 1, 5, NO_SKILL, seed, &sc);
        let r2 = simulate(123_456_789_012_345, 1, 5, NO_SKILL, 543_210_987_654_321, 1, 5, NO_SKILL, seed, &sc);

        assert_eq!(r1, r2);
    }

    /// Returns a 32-byte big-endian `uint256` seed with `last_byte` in the least-significant
    /// position, matching how `battle.json`'s small decimal seeds (1, 2, ...) encode.
    fn seed_from_u8(last_byte: u8) -> [u8; 32] {
        let mut seed = [0u8; 32];
        seed[31] = last_byte;
        seed
    }

    struct GoldenCase {
        name: &'static str,
        dna1: u64,
        rarity1: u8,
        level1: u16,
        skill1: u8,
        dna2: u64,
        rarity2: u8,
        level2: u16,
        skill2: u8,
        seed: [u8; 32],
        expected: BattleResult,
    }

    /// Cross-chain golden vectors (plan §7), transcribed from
    /// `contracts/test-vectors/battle.json` (generated against `CombatSimV1.simulate` via
    /// `contracts/ethereum/scripts/gen-battle-vectors.ts`). Keep in sync manually: this crate
    /// has no JSON dependency, so the file isn't read directly. NO_SKILL is encoded as `99`
    /// here (any value outside `0..=7`), matching the EVM fixture.
    fn golden_vectors() -> Vec<GoldenCase> {
        const NS: u8 = 99; // NO_SKILL sentinel used in battle.json
        vec![
            GoldenCase {
                name: "baseline-no-skill",
                dna1: 1_234_567_890_123_456, rarity1: 1, level1: 20, skill1: NS,
                dna2: 9_876_543_210_987_654, rarity2: 1, level2: 20, skill2: NS,
                seed: seed_from_u8(1),
                expected: BattleResult { first_wins: false, rounds: 6, winner_hp_remaining: 174 },
            },
            GoldenCase {
                name: "seed-zero",
                dna1: 1_234_567_890_123_456, rarity1: 1, level1: 20, skill1: NS,
                dna2: 9_876_543_210_987_654, rarity2: 1, level2: 20, skill2: NS,
                seed: [0u8; 32],
                expected: BattleResult { first_wins: false, rounds: 7, winner_hp_remaining: 93 },
            },
            GoldenCase {
                name: "seed-max",
                dna1: 1_234_567_890_123_456, rarity1: 1, level1: 20, skill1: NS,
                dna2: 9_876_543_210_987_654, rarity2: 1, level2: 20, skill2: NS,
                seed: [0xffu8; 32],
                expected: BattleResult { first_wins: false, rounds: 6, winner_hp_remaining: 224 },
            },
            GoldenCase {
                name: "tank-skill",
                dna1: 1_234_567_890_123_456, rarity1: 1, level1: 20, skill1: SKILL_TANK,
                dna2: 9_876_543_210_987_654, rarity2: 1, level2: 20, skill2: NS,
                seed: seed_from_u8(2),
                expected: BattleResult { first_wins: false, rounds: 8, winner_hp_remaining: 74 },
            },
            GoldenCase {
                name: "shell-skill",
                dna1: 1_234_567_890_123_456, rarity1: 1, level1: 20, skill1: SKILL_SHELL,
                dna2: 9_876_543_210_987_654, rarity2: 1, level2: 20, skill2: NS,
                seed: seed_from_u8(3),
                expected: BattleResult { first_wins: false, rounds: 7, winner_hp_remaining: 59 },
            },
            GoldenCase {
                name: "swift-skill",
                dna1: 1_234_567_890_123_456, rarity1: 1, level1: 20, skill1: SKILL_SWIFT,
                dna2: 9_876_543_210_987_654, rarity2: 1, level2: 20, skill2: NS,
                seed: seed_from_u8(4),
                expected: BattleResult { first_wins: false, rounds: 7, winner_hp_remaining: 28 },
            },
            GoldenCase {
                name: "cunning-skill",
                dna1: 1_234_567_890_123_456, rarity1: 1, level1: 20, skill1: SKILL_CUNNING,
                dna2: 9_876_543_210_987_654, rarity2: 1, level2: 20, skill2: NS,
                seed: seed_from_u8(5),
                expected: BattleResult { first_wins: false, rounds: 6, winner_hp_remaining: 150 },
            },
            GoldenCase {
                name: "fury-skill",
                dna1: 1_234_567_890_123_456, rarity1: 1, level1: 20, skill1: SKILL_FURY,
                dna2: 9_876_543_210_987_654, rarity2: 1, level2: 20, skill2: NS,
                seed: seed_from_u8(6),
                expected: BattleResult { first_wins: false, rounds: 6, winner_hp_remaining: 121 },
            },
            GoldenCase {
                name: "sage-skill",
                dna1: 1_234_567_890_123_456, rarity1: 1, level1: 20, skill1: SKILL_SAGE,
                dna2: 9_876_543_210_987_654, rarity2: 1, level2: 20, skill2: NS,
                seed: seed_from_u8(7),
                expected: BattleResult { first_wins: false, rounds: 5, winner_hp_remaining: 243 },
            },
            GoldenCase {
                name: "rebirth-skill",
                dna1: 1_234_567_890_123_456, rarity1: 1, level1: 20, skill1: SKILL_REBIRTH,
                dna2: 9_876_543_210_987_654, rarity2: 1, level2: 20, skill2: NS,
                seed: seed_from_u8(8),
                expected: BattleResult { first_wins: false, rounds: 8, winner_hp_remaining: 74 },
            },
            GoldenCase {
                name: "bloodlust-skill",
                dna1: 1_234_567_890_123_456, rarity1: 1, level1: 20, skill1: SKILL_BLOODLUST,
                dna2: 9_876_543_210_987_654, rarity2: 1, level2: 20, skill2: NS,
                seed: seed_from_u8(9),
                expected: BattleResult { first_wins: false, rounds: 7, winner_hp_remaining: 131 },
            },
            GoldenCase {
                name: "level-gap-max",
                dna1: 1_234_567_890_123_456, rarity1: 5, level1: 100, skill1: NS,
                dna2: 9_876_543_210_987_654, rarity2: 1, level2: 1, skill2: NS,
                seed: seed_from_u8(10),
                expected: BattleResult { first_wins: true, rounds: 2, winner_hp_remaining: 980 },
            },
            GoldenCase {
                name: "element-wheel-next",
                dna1: 1_111_111_111_111_111, rarity1: 1, level1: 20, skill1: NS,
                dna2: 1_234_567_890_123_412, rarity2: 1, level2: 20, skill2: NS,
                seed: seed_from_u8(11),
                expected: BattleResult { first_wins: false, rounds: 4, winner_hp_remaining: 248 },
            },
            GoldenCase {
                name: "mirror-tie",
                dna1: 1_234_567_890_123_456, rarity1: 1, level1: 20, skill1: NS,
                dna2: 1_234_567_890_123_456, rarity2: 1, level2: 20, skill2: NS,
                seed: seed_from_u8(12),
                expected: BattleResult { first_wins: true, rounds: 6, winner_hp_remaining: 52 },
            },
        ]
    }

    #[test]
    fn simulate_matches_evm_golden_vectors() {
        let sc = SkillConfig::default();
        for c in golden_vectors() {
            let result = simulate(
                c.dna1, c.rarity1, c.level1, c.skill1,
                c.dna2, c.rarity2, c.level2, c.skill2,
                c.seed, &sc,
            );
            assert_eq!(result, c.expected, "vector \"{}\" mismatch", c.name);
        }
    }
}
