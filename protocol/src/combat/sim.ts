import { addHeal, strike } from './strike';
import { applyBonus, type AttrBonus, NO_BONUS } from './equipment';
import { elementMod, extract, toUint16 } from './dna';
import { roundSeed } from './rng';
import { DEFAULT_SKILL_CONFIG, SKILL_REBIRTH, SKILL_SAGE, SKILL_SHELL, SKILL_SWIFT, SKILL_TANK, type SkillConfig } from './skills';

/** Caps the simulation (plan §3.3); mirrors CombatSim.sol / combat.rs / indexer-go's MaxRounds. */
export const MAX_ROUNDS = 30;

/** Outcome of a simulated battle. `firstWins` is from pet 1's (the
 *  attacker's) perspective. Mirrors CombatSim.BattleResult / combat::Result /
 *  indexer-go's Result. */
export interface SimResult {
    firstWins: boolean;
    rounds: number;
    winnerHpRemaining: number;
}

/**
 * One resolved attack, in fight order, for blow-by-blow animation.
 * Recorded inline as `simulate` runs
 * the same computation the result is derived from — never a second pass, so
 * the log can't drift from the math it's describing.
 */
export interface StrikeLogEntry {
    round: number;
    /** Which pet made this strike (1 = petId1/attacker, 2 = petId2/defender). */
    attacker: 1 | 2;
    isMagic: boolean;
    crit: boolean;
    damage: bigint;
    /** Bloodlust lifesteal; 0 otherwise. */
    heal: bigint;
    /** 85 | 100 | 115 — the element multiplier actually applied. */
    elementMult: number;
    furyTriggered: boolean;
    /** True when this strike would have killed the defender, but Rebirth
     *  (once per battle) held it at 1 HP instead. */
    rebirthTriggered: boolean;
    hp1After: bigint;
    hp2After: bigint;
}

export interface SimOutcome {
    result: SimResult;
    log: StrikeLogEntry[];
    /** Both pets' max HP for this fight (post pre-battle skill modifiers, e.g.
     *  Tank's +HP), so a consumer can render HP-bar percentages from `log`
     *  entries' `hp1After`/`hp2After` without re-deriving attrs itself. */
    startHp1: bigint;
    startHp2: bigint;
}

/**
 * Runs a full battle between pet 1 and pet 2 seeded by a 32-byte combat seed
 * (the on-chain uint256 `seed`/`randomness`). A move-for-move port of
 * CombatSim.simulate / combat::simulate / indexer-go's sim.go Simulate, with
 * one addition: it also returns a per-strike log for live animation.
 * Presentation only — the on-chain `BattleResolved` event is always the
 * authoritative result; see this port's package README for the reconciliation
 * rule.
 */
export function simulate(
    dna1: bigint,
    rarity1: number,
    level1: number,
    skill1: number,
    dna2: bigint,
    rarity2: number,
    level2: number,
    skill2: number,
    seed: bigint,
    sc: SkillConfig = DEFAULT_SKILL_CONFIG,
    /** Pet 1's equipment total (roadmap §4). Defaults to ungeared. */
    bonus1: AttrBonus = NO_BONUS,
    /** Pet 2's equipment total. */
    bonus2: AttrBonus = NO_BONUS,
): SimOutcome {
    const a = extract(dna1, rarity1, level1);
    const b = extract(dna2, rarity2, level2);

    // Equipment lands between extraction and the skill modifiers, and the order is a
    // real decision. Applying it first means Tank's +20% HP multiplies the geared total
    // rather than the bare one, so armour and the archetype compound the way a player
    // expects. It also keeps one clamp site: gear is the only additive input here, and
    // everything after it is a percentage of whatever it produced.
    //
    // The Go verifier applies it at the identical point. These two ports were written to
    // disagree if either drifts (§F), which is worth nothing if a reordering here goes
    // unmatched there.
    applyBonus(a, bonus1);
    applyBonus(b, bonus2);

    // Pre-battle skill modifiers (Tank, Shell, Sage) — mutate the extracted
    // attrs in place, exactly like the Go/Solidity/Rust ports do.
    if (skill1 === SKILL_TANK) a.hp = toUint16((a.hp * BigInt(sc.tankHpMult)) / 100n);
    if (skill2 === SKILL_TANK) b.hp = toUint16((b.hp * BigInt(sc.tankHpMult)) / 100n);
    if (skill1 === SKILL_SHELL) a.def = toUint16((a.def * BigInt(sc.shellDefMult)) / 100n);
    if (skill2 === SKILL_SHELL) b.def = toUint16((b.def * BigInt(sc.shellDefMult)) / 100n);
    if (skill1 === SKILL_SAGE) a.mdef = toUint16((a.mdef * BigInt(sc.sageMdefMult)) / 100n);
    if (skill2 === SKILL_SAGE) b.mdef = toUint16((b.mdef * BigInt(sc.sageMdefMult)) / 100n);

    let hpA = a.hp;
    let hpB = b.hp;
    const startHpA = a.hp;
    const startHpB = b.hp;

    const elemAB = elementMod(a.element, b.element); // A attacks B
    const elemBA = elementMod(b.element, a.element); // B attacks A

    let rebirthUsed1 = false;
    let rebirthUsed2 = false;
    const log: StrikeLogEntry[] = [];

    let r = 0;
    for (; r < MAX_ROUNDS && hpA > 0n && hpB > 0n; r++) {
        const rs = roundSeed(seed, r);

        // Initiative (plan §3.3, §3.7).
        let aFirst: boolean;
        if (skill1 === SKILL_SHELL && skill2 !== SKILL_SHELL) {
            aFirst = false; // Shell A: A always second
        } else if (skill2 === SKILL_SHELL && skill1 !== SKILL_SHELL) {
            aFirst = true; // Shell B: B always second = A goes first
        } else if (a.int !== b.int) {
            aFirst = a.int > b.int;
        } else {
            // Tie: Swift wins; both-Swift or no-Swift -> attacker (A) wins.
            aFirst = skill1 === SKILL_SWIFT || skill2 !== SKILL_SWIFT;
        }

        if (aFirst) {
            const first = strike(a, skill1, hpA, startHpA, b.def, b.mdef, hpB, elemAB, rs, 0, sc);
            hpB = first.newHpDef;
            hpA = addHeal(hpA, first.heal, startHpA);
            let rebirth2 = false;
            if (hpB === 0n && skill2 === SKILL_REBIRTH && !rebirthUsed2) {
                hpB = 1n;
                rebirthUsed2 = true;
                rebirth2 = true;
            }
            log.push({
                round: r, attacker: 1, isMagic: first.isMagic, crit: first.crit, damage: first.damage,
                heal: first.heal, elementMult: first.elementMult, furyTriggered: first.furyTriggered,
                rebirthTriggered: rebirth2, hp1After: hpA, hp2After: hpB,
            });
            if (hpB > 0n) {
                const second = strike(b, skill2, hpB, startHpB, a.def, a.mdef, hpA, elemBA, rs, 2, sc);
                hpA = second.newHpDef;
                hpB = addHeal(hpB, second.heal, startHpB);
                let rebirth1 = false;
                if (hpA === 0n && skill1 === SKILL_REBIRTH && !rebirthUsed1) {
                    hpA = 1n;
                    rebirthUsed1 = true;
                    rebirth1 = true;
                }
                log.push({
                    round: r, attacker: 2, isMagic: second.isMagic, crit: second.crit, damage: second.damage,
                    heal: second.heal, elementMult: second.elementMult, furyTriggered: second.furyTriggered,
                    rebirthTriggered: rebirth1, hp1After: hpA, hp2After: hpB,
                });
            }
        } else {
            const first = strike(b, skill2, hpB, startHpB, a.def, a.mdef, hpA, elemBA, rs, 0, sc);
            hpA = first.newHpDef;
            hpB = addHeal(hpB, first.heal, startHpB);
            let rebirth1 = false;
            if (hpA === 0n && skill1 === SKILL_REBIRTH && !rebirthUsed1) {
                hpA = 1n;
                rebirthUsed1 = true;
                rebirth1 = true;
            }
            log.push({
                round: r, attacker: 2, isMagic: first.isMagic, crit: first.crit, damage: first.damage,
                heal: first.heal, elementMult: first.elementMult, furyTriggered: first.furyTriggered,
                rebirthTriggered: rebirth1, hp1After: hpA, hp2After: hpB,
            });
            if (hpA > 0n) {
                const second = strike(a, skill1, hpA, startHpA, b.def, b.mdef, hpB, elemAB, rs, 2, sc);
                hpB = second.newHpDef;
                hpA = addHeal(hpA, second.heal, startHpA);
                let rebirth2 = false;
                if (hpB === 0n && skill2 === SKILL_REBIRTH && !rebirthUsed2) {
                    hpB = 1n;
                    rebirthUsed2 = true;
                    rebirth2 = true;
                }
                log.push({
                    round: r, attacker: 1, isMagic: second.isMagic, crit: second.crit, damage: second.damage,
                    heal: second.heal, elementMult: second.elementMult, furyTriggered: second.furyTriggered,
                    rebirthTriggered: rebirth2, hp1After: hpA, hp2After: hpB,
                });
            }
        }
    }

    let firstWins: boolean;
    if (hpA > 0n && hpB === 0n) {
        firstWins = true;
    } else if (hpB > 0n && hpA === 0n) {
        firstWins = false;
    } else {
        const bpsA = (hpA * 10000n) / startHpA;
        const bpsB = (hpB * 10000n) / startHpB;
        firstWins = bpsA > bpsB; // exact tie -> false -> defender (pet 2) wins
    }

    const winnerHp = firstWins ? hpA : hpB;
    const winnerHpCapped = winnerHp > 0xffffn ? 0xffffn : winnerHp; // clamp, not a truncating cast

    return {
        result: { firstWins, rounds: r, winnerHpRemaining: Number(winnerHpCapped) },
        log,
        startHp1: startHpA,
        startHp2: startHpB,
    };
}
