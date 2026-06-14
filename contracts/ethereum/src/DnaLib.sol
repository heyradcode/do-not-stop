// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title DnaLib
 * @dev Canonical DNA → attribute derivation (plan §3.1).  All functions are internal so the
 *      library is inlined into each consumer rather than deployed as a linked library.
 *
 *      Digit-pair layout (pair index, digits, LSB-first):
 *        0        element gene  → element = pair0 % 6
 *        1        hpGene        (0-99)
 *        2        atkGene       (0-99)
 *        3        defGene       (0-99)
 *        4        intGene       (0-99; also drives initiative, crits)
 *        5        mdefGene      (0-99)
 *        6-7      cosmetic      (appearance, species index — unused by combat)
 *
 *      Effective stats (integer math, must be bit-identical cross-chain, plan §3.1):
 *        HP   = 100 + 4*hpGene  + 6*level
 *        ATK  = 10  + atkGene   + 2*level
 *        DEF  = 10  + defGene   + 2*level
 *        INT  = 10  + intGene   + 2*level   (initiative + magic + crits)
 *        MDEF = 10  + mdefGene  + 2*level
 *      All multiplied by rarity bonus ×(100 + 5*(rarity−1)) / 100.
 *
 *      Rarity from DNA: pair 0 is the rarity-score pair (50/25/15/8/2 split, plan §4.3).
 *      This matches the legacy Utils.calculateRarity (dna % 100) exactly.
 *
 *      Element wheel (plan §3.2): 0→1→2→3→4→5→0.
 *      Striking the *next* element in the cycle: ×115/100.
 *      Striking the *previous*: ×85/100.  All other matchups: ×100/100.
 */
library DnaLib {
    uint256 internal constant DNA_MODULUS = 10 ** 16;

    struct Attrs {
        uint16 hp;
        uint16 atk;
        uint16 def;
        uint16 intl;   // INT: magic attack + initiative + crits
        uint16 mdef;
        uint8  element; // 0-5
    }

    function digitPair(uint256 dna, uint256 pairIdx) internal pure returns (uint256) {
        return (dna / (10 ** (pairIdx * 2))) % 100;
    }

    // extract returns level-scaled, rarity-multiplied battle attributes.
    function extract(uint256 dna, uint8 rarity, uint32 level) internal pure returns (Attrs memory a) {
        uint256 elem = digitPair(dna, 0) % 6;
        uint256 hpG  = digitPair(dna, 1);
        uint256 atkG = digitPair(dna, 2);
        uint256 defG = digitPair(dna, 3);
        uint256 intG = digitPair(dna, 4);
        uint256 mdG  = digitPair(dna, 5);

        uint256 mul = 100 + (uint256(rarity > 0 ? rarity : 1) - 1) * 5;
        uint256 lv  = uint256(level);

        a.hp      = uint16((100 + 4 * hpG  + 6 * lv) * mul / 100);
        a.atk     = uint16((10  +     atkG + 2 * lv) * mul / 100);
        a.def     = uint16((10  +     defG + 2 * lv) * mul / 100);
        a.intl    = uint16((10  +     intG + 2 * lv) * mul / 100);
        a.mdef    = uint16((10  +     mdG  + 2 * lv) * mul / 100);
        a.element = uint8(elem);
    }

    // Rarity from DNA: uses digit pair 0 (= dna % 100), matching legacy Utils.calculateRarity.
    function rarityFromDna(uint256 dna) internal pure returns (uint8) {
        uint256 score = digitPair(dna, 0);
        if (score < 50) return 1;
        if (score < 75) return 2;
        if (score < 90) return 3;
        if (score < 98) return 4;
        return 5;
    }

    // Element advantage for a strike (attacker element vs defender element).
    // Returns 115 (advantage), 85 (disadvantage), or 100 (neutral/same).
    function elementMod(uint8 attacker, uint8 defender) internal pure returns (uint256) {
        if (attacker == defender) return 100;
        if (defender == (attacker + 1) % 6) return 115; // attacker hits its next → advantage
        if (attacker == (defender + 1) % 6) return 85;  // defender is attacker's next → disadvantage
        return 100; // non-adjacent in the 6-cycle → neutral
    }
}
