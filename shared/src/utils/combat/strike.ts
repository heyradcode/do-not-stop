import type { Hex } from 'viem';
import { strikeRoll } from './rng';
import { SKILL_BLOODLUST, SKILL_CUNNING, SKILL_FURY, SKILL_SAGE, SKILL_SWIFT, type SkillConfig } from './skills';
import type { Attrs } from './dna';

/**
 * One resolved attack. Mirrors indexer-go's strike.go `strike` return value
 * (newHpDef, atkHeal) plus extra fields (isMagic/crit/elementMult/
 * furyTriggered) the Go port doesn't need but the live-replay animation does
 * (plan-realtime-battle-impl.md Phase 4). These extra fields are read off the
 * exact same computation as the damage number, never recomputed separately —
 * there is one simulation code path, and the log is a write-only view onto it.
 */
export interface StrikeOutcome {
    newHpDef: bigint;
    /** Bloodlust lifesteal; 0 otherwise. */
    heal: bigint;
    damage: bigint;
    isMagic: boolean;
    crit: boolean;
    /** 85 | 100 | 115 — the element multiplier actually applied (after Sage's
     *  ignore-penalty-on-magic override, if it fired). */
    elementMult: number;
    furyTriggered: boolean;
}

/** Executes one attack. Mirrors CombatSim._strike / combat::strike /
 *  indexer-go's strike.go `strike`. */
export function strike(
    atk: Attrs,
    atkSkill: number,
    hpAtk: bigint,
    startHpAtk: bigint,
    defDef: bigint,
    defMdef: bigint,
    hpDef: bigint,
    elemMult: bigint,
    rs: Hex,
    slotOffset: number,
    sc: SkillConfig,
): StrikeOutcome {
    const total = atk.atk + atk.int;
    const pMagicBps = (10000n * atk.int) / total;
    const typeRoll = strikeRoll(rs, slotOffset);
    const isMagic = typeRoll < pMagicBps;

    let dmg = isMagic ? (atk.int * 100n) / (100n + defMdef) : (atk.atk * 100n) / (100n + defDef);
    if (dmg === 0n) dmg = 1n;

    // Element modifier; Sage ignores penalty on magic strikes.
    let effElem = elemMult;
    if (atkSkill === SKILL_SAGE && isMagic && elemMult < 100n) effElem = 100n;
    dmg = (dmg * effElem) / 100n;

    // Fury: +furyDmgMult% while own HP < furyHpThreshold bps of start.
    let furyTriggered = false;
    if (atkSkill === SKILL_FURY && startHpAtk > 0n) {
        if ((hpAtk * 10000n) / startHpAtk < BigInt(sc.furyHpThreshold)) {
            dmg = (dmg * BigInt(sc.furyDmgMult)) / 100n;
            furyTriggered = true;
        }
    }

    // Crit.
    let critCap = 3000n;
    if (atkSkill === SKILL_CUNNING) critCap = BigInt(sc.cunningCritCap);
    let critBase = 500n;
    if (atkSkill === SKILL_SWIFT) critBase += BigInt(sc.swiftCritBonus);
    const uncappedCritBps = critBase + 25n * atk.int;
    const critBps = uncappedCritBps < critCap ? uncappedCritBps : critCap;
    let crit = false;
    if (strikeRoll(rs, slotOffset + 1) < critBps) {
        dmg = (dmg * 150n) / 100n;
        crit = true;
    }

    if (dmg === 0n) dmg = 1n;
    const newHpDef = hpDef > dmg ? hpDef - dmg : 0n;

    // Bloodlust: heal attacker for bloodlustBps/10000 of physical damage dealt.
    let heal = 0n;
    if (atkSkill === SKILL_BLOODLUST && !isMagic) {
        heal = (dmg * BigInt(sc.bloodlustBps)) / 10000n;
    }

    return { newHpDef, heal, damage: dmg, isMagic, crit, elementMult: Number(effElem), furyTriggered };
}

/** Adds heal to hp, capped at startHp (prevents overheal). Mirrors
 *  CombatSim._addHeal / combat::add_heal / indexer-go's strike.go addHeal. */
export function addHeal(hp: bigint, heal: bigint, startHp: bigint): bigint {
    if (heal === 0n) return hp;
    const result = hp + heal;
    return result > startHp ? startHp : result;
}
