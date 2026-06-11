// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title DnaLib
 * @dev DNA decoding: extracts 5 battle attributes and element from a 16-digit decimal string.
 *      All functions are internal-only so the library is inlined rather than linked.
 *
 *      Digit-pair layout (pair index, digits):
 *        0 → digits 00-01 → HP  (50 + pair * 2, base 50-248)
 *        1 → digits 02-03 → ATK (10 + pair,     base 10-109)
 *        2 → digits 04-05 → DEF (5  + pair / 2, base 5-54)
 *        3 → digits 06-07 → INT (raw 0-99; drives element + crit)
 *        4 → digits 08-09 → MDEF(5  + pair / 2, base 5-54)
 *        5 → digits 10-11 → reserved (future skill/species)
 *        6 → digits 12-13 → species index within tier (§3.7)
 *        7 → digits 14-15 → rarity score (used at mint only)
 *
 *      Rarity multiplier: +5 % per tier above 1 applied to all base stats.
 *      Element: INT % 5 → 0=Fire 1=Water 2=Earth 3=Air 4=Lightning
 */
library DnaLib {
    uint256 internal constant DNA_MODULUS = 10 ** 16;

    struct Attrs {
        uint16 hp;
        uint16 atk;
        uint16 def;
        uint16 intl;
        uint16 mdef;
        uint8  element; // 0 Fire 1 Water 2 Earth 3 Air 4 Lightning
    }

    function digitPair(uint256 dna, uint256 pairIdx) internal pure returns (uint256) {
        return (dna / (10 ** (pairIdx * 2))) % 100;
    }

    function extract(uint256 dna, uint8 rarity) internal pure returns (Attrs memory a) {
        uint256 rawHp   = digitPair(dna, 0);
        uint256 rawAtk  = digitPair(dna, 1);
        uint256 rawDef  = digitPair(dna, 2);
        uint256 rawInt  = digitPair(dna, 3);
        uint256 rawMdef = digitPair(dna, 4);

        // Rarity multiplier: tier 1 = 100%, tier 2 = 105% … tier 5 = 120%
        uint256 mul = 100 + (uint256(rarity > 0 ? rarity : 1) - 1) * 5;

        a.hp      = uint16((50  + rawHp  * 2)   * mul / 100);
        a.atk     = uint16((10  + rawAtk)        * mul / 100);
        a.def     = uint16((5   + rawDef  / 2)   * mul / 100);
        a.intl    = uint16(rawInt);                              // raw 0-99
        a.mdef    = uint16((5   + rawMdef / 2)   * mul / 100);
        a.element = uint8(rawInt % 5);
    }

    // Element-advantage table.
    // Wheel:  Fire(0) > Earth(2) > Air(3) > Lightning(4) > Water(1) > Fire(0)
    // Returns 115 (attacker advantage), 85 (disadvantage), or 100 (neutral/same).
    function elementMod(uint8 attacker, uint8 defender) internal pure returns (uint256) {
        if (attacker == defender) return 100;
        // Wins
        if ((attacker == 0 && defender == 2) ||  // Fire > Earth
            (attacker == 2 && defender == 3) ||  // Earth > Air
            (attacker == 3 && defender == 4) ||  // Air > Lightning
            (attacker == 4 && defender == 1) ||  // Lightning > Water
            (attacker == 1 && defender == 0))    // Water > Fire
        {
            return 115;
        }
        // Loses (reverse of the above)
        if ((attacker == 2 && defender == 0) ||
            (attacker == 3 && defender == 2) ||
            (attacker == 4 && defender == 3) ||
            (attacker == 1 && defender == 4) ||
            (attacker == 0 && defender == 1))
        {
            return 85;
        }
        return 100; // non-adjacent in the wheel → neutral
    }
}
