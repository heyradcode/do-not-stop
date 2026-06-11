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
 *        strike type per attack: pMagicBps = 10000 * INT / (ATK + INT)
 *          physical: max(1, ATK  * 100 / (100 + DEF))
 *          magic:    max(1, INT  * 100 / (100 + MDEF))
 *        element modifier ±15% applied to either type.
 *        crit: critBps = min(500 + 25*INT, 3000); multiplier 1.5×.
 *        round cap 30; tie → higher remaining HP bps; exact tie → defender (pet 2).
 *        RNG per strike: keccak256(seed ‖ roundIndex ‖ slotOffset) — bit-identical cross-chain.
 */
contract CombatSimV1 {
    struct BattleResult {
        bool   firstWins;
        uint8  rounds;
        uint16 winnerHpRemaining;
    }

    function simulate(
        uint256 dna1, uint8 rarity1, uint32 level1,
        uint256 dna2, uint8 rarity2, uint32 level2,
        uint256 seed
    ) external pure returns (BattleResult memory result) {
        DnaLib.Attrs memory a = DnaLib.extract(dna1, rarity1, level1);
        DnaLib.Attrs memory b = DnaLib.extract(dna2, rarity2, level2);

        uint32 hpA      = a.hp;
        uint32 hpB      = b.hp;
        uint32 startHpA = a.hp;
        uint32 startHpB = b.hp;

        uint256 elemAB = DnaLib.elementMod(a.element, b.element); // A attacks B
        uint256 elemBA = DnaLib.elementMod(b.element, a.element); // B attacks A

        uint8 r;
        for (r = 0; r < 30 && hpA > 0 && hpB > 0; r++) {
            uint256 rs = uint256(keccak256(abi.encodePacked(seed, r)));
            // Initiative: higher INT goes first; tie → A (attacker)
            if (a.intl >= b.intl) {
                hpB = _strike(a, b.def, b.mdef, hpB, elemAB, rs, 0);
                if (hpB > 0) hpA = _strike(b, a.def, a.mdef, hpA, elemBA, rs, 2);
            } else {
                hpA = _strike(b, a.def, a.mdef, hpA, elemBA, rs, 0);
                if (hpA > 0) hpB = _strike(a, b.def, b.mdef, hpB, elemAB, rs, 2);
            }
        }

        bool firstWins;
        if (hpA > 0 && hpB == 0) {
            firstWins = true;
        } else if (hpB > 0 && hpA == 0) {
            firstWins = false;
        } else {
            // Round cap: compare remaining HP as bps of starting HP
            uint256 bpsA = uint256(hpA) * 10000 / startHpA;
            uint256 bpsB = uint256(hpB) * 10000 / startHpB;
            firstWins = bpsA > bpsB; // exact tie → bpsA == bpsB → false → defender (pet 2) wins
        }

        result.firstWins         = firstWins;
        result.rounds            = r;
        result.winnerHpRemaining = uint16(
            (firstWins ? hpA : hpB) > type(uint16).max
                ? type(uint16).max
                : (firstWins ? hpA : hpB)
        );
    }

    // Execute one strike from `atk` against a defender with the given DEF/MDEF and current HP.
    // slotOffset distinguishes the first and second striker in the same round for RNG isolation.
    function _strike(
        DnaLib.Attrs memory atk,
        uint16 defDef,
        uint16 defMdef,
        uint32 hpDef,
        uint256 elemMult,
        uint256 roundSeed,
        uint8   slotOffset
    ) private pure returns (uint32) {
        // Strike type: physical or magic
        uint256 total     = uint256(atk.atk) + uint256(atk.intl);
        uint256 pMagicBps = 10000 * uint256(atk.intl) / total;
        uint256 typeRoll  = uint256(keccak256(abi.encodePacked(roundSeed, slotOffset))) % 10000;

        uint256 dmg;
        if (typeRoll < pMagicBps) {
            dmg = uint256(atk.intl) * 100 / (100 + uint256(defMdef));
        } else {
            dmg = uint256(atk.atk)  * 100 / (100 + uint256(defDef));
        }
        if (dmg == 0) dmg = 1;

        // Element modifier
        dmg = dmg * elemMult / 100;

        // Crit: critBps = min(500 + 25*INT, 3000); roll /10000
        uint256 critBps  = 500 + 25 * uint256(atk.intl);
        if (critBps > 3000) critBps = 3000;
        uint256 critRoll = uint256(keccak256(abi.encodePacked(roundSeed, uint8(slotOffset + 1)))) % 10000;
        if (critRoll < critBps) dmg = dmg * 150 / 100;

        if (dmg == 0) dmg = 1; // floor after all modifiers
        return hpDef > uint32(dmg) ? hpDef - uint32(dmg) : 0;
    }
}
