// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./DnaLib.sol";

/**
 * @title CombatSimV1
 * @dev Stateless, pure battle simulator — deploys as a standalone contract so a balance
 *      patch is "deploy CombatSimV2, setCombatSim()" with no proxy upgrade required and
 *      the old sim stays on-chain for historical replay.
 *
 *      Round model (plan §3.3):
 *        initiative: higher INT acts first each round; tie → attacker (pet 1).
 *          Shell overrides: always strikes second.
 *          Swift: wins all initiative ties.
 *        strike type per attack: pMagicBps = 10000 * INT / (ATK + INT)
 *          physical: max(1, ATK  * 100 / (100 + DEF))
 *          magic:    max(1, INT  * 100 / (100 + MDEF))
 *        element modifier ±15% applied to either type.
 *        crit: critBps = min(500 + 25*INT, 3000); multiplier 1.5×.
 *        round cap 30; tie → higher remaining HP bps; exact tie → defender (pet 2).
 *        RNG per strike: keccak256(seed ‖ roundIndex ‖ slotOffset) — bit-identical cross-chain.
 *
 *      Skill archetypes (index = speciesId % 8, plan §3.7):
 *        0 Tank      +tankHpMult% HP (pre-battle)
 *        1 Shell     +shellDefMult% DEF; always strikes second
 *        2 Swift     wins initiative ties; +swiftCritBonus bps to crit base
 *        3 Cunning   crit cap raised to cunningCritCap bps (default 4000 = 40%)
 *        4 Fury      +furyDmgMult% damage while own HP < furyHpThreshold bps of start
 *        5 Sage      +sageMdefMult% MDEF; magic strikes ignore element penalty
 *        6 Rebirth   once per battle, survive a killing blow at 1 HP
 *        7 Bloodlust heals bloodlustBps/10000 of physical damage dealt
 */
contract CombatSimV1 {
    struct BattleResult {
        bool   firstWins;
        uint8  rounds;
        uint16 winnerHpRemaining;
    }

    // Skill balance values — read from GameConfig and passed in by GameLogicV1 (plan §3.7).
    struct SkillConfig {
        uint16 tankHpMult;       // ×/100, e.g. 120 = +20% HP
        uint16 shellDefMult;     // ×/100, e.g. 125 = +25% DEF
        uint16 swiftCritBonus;   // bps added to crit base, e.g. 50 = +0.5%
        uint16 cunningCritCap;   // bps cap, e.g. 4000 = 40%
        uint16 furyDmgMult;      // ×/100 when triggered, e.g. 130 = +30%
        uint16 furyHpThreshold;  // bps of startHP to trigger, e.g. 3000 = 30%
        uint16 sageMdefMult;     // ×/100, e.g. 125 = +25% MDEF
        uint16 bloodlustBps;     // bps of physical dmg healed, e.g. 150 = 15%
    }

    function simulate(
        uint256 dna1, uint8 rarity1, uint32 level1, uint8 skill1,
        uint256 dna2, uint8 rarity2, uint32 level2, uint8 skill2,
        uint256 seed,
        SkillConfig calldata sc
    ) external pure returns (BattleResult memory result) {
        DnaLib.Attrs memory a = DnaLib.extract(dna1, rarity1, level1);
        DnaLib.Attrs memory b = DnaLib.extract(dna2, rarity2, level2);

        // Pre-battle skill modifiers (Tank, Shell, Sage)
        if (skill1 == 0) a.hp   = uint16(uint256(a.hp)   * uint256(sc.tankHpMult)   / 100);
        if (skill2 == 0) b.hp   = uint16(uint256(b.hp)   * uint256(sc.tankHpMult)   / 100);
        if (skill1 == 1) a.def  = uint16(uint256(a.def)  * uint256(sc.shellDefMult) / 100);
        if (skill2 == 1) b.def  = uint16(uint256(b.def)  * uint256(sc.shellDefMult) / 100);
        if (skill1 == 5) a.mdef = uint16(uint256(a.mdef) * uint256(sc.sageMdefMult) / 100);
        if (skill2 == 5) b.mdef = uint16(uint256(b.mdef) * uint256(sc.sageMdefMult) / 100);

        uint32 hpA      = a.hp;
        uint32 hpB      = b.hp;
        uint32 startHpA = a.hp;
        uint32 startHpB = b.hp;

        uint256 elemAB = DnaLib.elementMod(a.element, b.element); // A attacks B
        uint256 elemBA = DnaLib.elementMod(b.element, a.element); // B attacks A

        bool rebirthUsed1;
        bool rebirthUsed2;

        uint8 r;
        for (r = 0; r < 30 && hpA > 0 && hpB > 0; r++) {
            uint256 rs = uint256(keccak256(abi.encodePacked(seed, r)));

            // Initiative (plan §3.3, §3.7)
            bool aFirst;
            if (skill1 == 1 && skill2 != 1) {
                aFirst = false; // Shell A: A always second
            } else if (skill2 == 1 && skill1 != 1) {
                aFirst = true;  // Shell B: B always second = A goes first
            } else if (a.intl != b.intl) {
                aFirst = a.intl > b.intl;
            } else {
                // Tie: Swift wins; both-Swift or no-Swift → attacker (A) wins
                aFirst = (skill1 == 2) || (skill2 != 2);
            }

            uint32 healA;
            uint32 healB;
            if (aFirst) {
                (hpB, healA) = _strike(a, skill1, hpA, startHpA, b.def, b.mdef, hpB, elemAB, rs, 0, sc);
                hpA = _addHeal(hpA, healA, startHpA);
                if (hpB == 0 && skill2 == 6 && !rebirthUsed2) { hpB = 1; rebirthUsed2 = true; }
                if (hpB > 0) {
                    (hpA, healB) = _strike(b, skill2, hpB, startHpB, a.def, a.mdef, hpA, elemBA, rs, 2, sc);
                    hpB = _addHeal(hpB, healB, startHpB);
                    if (hpA == 0 && skill1 == 6 && !rebirthUsed1) { hpA = 1; rebirthUsed1 = true; }
                }
            } else {
                (hpA, healB) = _strike(b, skill2, hpB, startHpB, a.def, a.mdef, hpA, elemBA, rs, 0, sc);
                hpB = _addHeal(hpB, healB, startHpB);
                if (hpA == 0 && skill1 == 6 && !rebirthUsed1) { hpA = 1; rebirthUsed1 = true; }
                if (hpA > 0) {
                    (hpB, healA) = _strike(a, skill1, hpA, startHpA, b.def, b.mdef, hpB, elemAB, rs, 2, sc);
                    hpA = _addHeal(hpA, healA, startHpA);
                    if (hpB == 0 && skill2 == 6 && !rebirthUsed2) { hpB = 1; rebirthUsed2 = true; }
                }
            }
        }

        bool firstWins;
        if (hpA > 0 && hpB == 0) {
            firstWins = true;
        } else if (hpB > 0 && hpA == 0) {
            firstWins = false;
        } else {
            uint256 bpsA = uint256(hpA) * 10000 / startHpA;
            uint256 bpsB = uint256(hpB) * 10000 / startHpB;
            firstWins = bpsA > bpsB; // exact tie → false → defender (pet 2) wins
        }

        result.firstWins         = firstWins;
        result.rounds            = r;
        result.winnerHpRemaining = uint16(
            (firstWins ? hpA : hpB) > type(uint16).max
                ? type(uint16).max
                : (firstWins ? hpA : hpB)
        );
    }

    // Execute one strike. Returns (newHpDef, atkHeal) where atkHeal is Bloodlust lifesteal.
    function _strike(
        DnaLib.Attrs memory atk,
        uint8   atkSkill,
        uint32  hpAtk,
        uint32  startHpAtk,
        uint16  defDef,
        uint16  defMdef,
        uint32  hpDef,
        uint256 elemMult,
        uint256 roundSeed,
        uint8   slotOffset,
        SkillConfig memory sc
    ) private pure returns (uint32 newHpDef, uint32 atkHeal) {
        uint256 total     = uint256(atk.atk) + uint256(atk.intl);
        uint256 pMagicBps = 10000 * uint256(atk.intl) / total;
        uint256 typeRoll  = uint256(keccak256(abi.encodePacked(roundSeed, slotOffset))) % 10000;

        bool isMagic = typeRoll < pMagicBps;
        uint256 dmg;
        if (isMagic) {
            dmg = uint256(atk.intl) * 100 / (100 + uint256(defMdef));
        } else {
            dmg = uint256(atk.atk)  * 100 / (100 + uint256(defDef));
        }
        if (dmg == 0) dmg = 1;

        // Element modifier; Sage ignores penalty on magic strikes
        uint256 effElem = elemMult;
        if (atkSkill == 5 && isMagic && elemMult < 100) effElem = 100;
        dmg = dmg * effElem / 100;

        // Fury: +furyDmgMult% while own HP < furyHpThreshold bps of start
        if (atkSkill == 4 && startHpAtk > 0) {
            if (uint256(hpAtk) * 10000 / uint256(startHpAtk) < uint256(sc.furyHpThreshold)) {
                dmg = dmg * uint256(sc.furyDmgMult) / 100;
            }
        }

        // Crit
        uint256 critCap  = (atkSkill == 3) ? uint256(sc.cunningCritCap) : 3000;
        uint256 critBase = 500 + ((atkSkill == 2) ? uint256(sc.swiftCritBonus) : 0);
        uint256 critBps  = critBase + 25 * uint256(atk.intl);
        if (critBps > critCap) critBps = critCap;
        uint256 critRoll = uint256(keccak256(abi.encodePacked(roundSeed, uint8(slotOffset + 1)))) % 10000;
        if (critRoll < critBps) dmg = dmg * 150 / 100;

        if (dmg == 0) dmg = 1;
        newHpDef = hpDef > uint32(dmg) ? hpDef - uint32(dmg) : 0;

        // Bloodlust: heal attacker for bloodlustBps/10000 of physical damage dealt
        if (atkSkill == 7 && !isMagic) {
            atkHeal = uint32(dmg * uint256(sc.bloodlustBps) / 10000);
        }
    }

    // Safe HP add, capped at startHp (prevents overheal).
    function _addHeal(uint32 hp, uint32 heal, uint32 startHp) private pure returns (uint32) {
        if (heal == 0) return hp;
        uint256 result = uint256(hp) + uint256(heal);
        return uint32(result > uint256(startHp) ? uint256(startHp) : result);
    }
}
