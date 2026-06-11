// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./DnaLib.sol";

/**
 * @title CombatSimV1
 * @dev Stateless, pure battle simulator.  GameLogicV1 fetches pet data, calls simulate(),
 *      then applies the result (win/loss counts, XP, cooldowns).
 *
 *      Round model (plan §3.3):
 *        - Up to 15 rounds; both pets attack each round.
 *        - Per-attack RNG: keccak256(seed, round, slot) % 100.
 *        - Element advantage ±15 % from DnaLib.elementMod().
 *        - Crit chance: 5 % + INT/20 (max ≈10 %); crit multiplier 1.5×.
 *        - Physical damage: ATK * 100 / (100 + DEF), floored at 1.
 *        - Tie (equal HP after 15 rounds): first pet wins.
 */
contract CombatSimV1 {
    struct BattleResult {
        bool  firstWins;
        uint8 rounds;
        uint16 winnerHpRemaining;
    }

    function simulate(
        uint256 dna1, uint8 rarity1,
        uint256 dna2, uint8 rarity2,
        uint256 seed
    ) external pure returns (BattleResult memory result) {
        DnaLib.Attrs memory a = DnaLib.extract(dna1, rarity1);
        DnaLib.Attrs memory b = DnaLib.extract(dna2, rarity2);

        uint32 hpA = a.hp;
        uint32 hpB = b.hp;
        uint8  rounds;

        uint256 elemAB = DnaLib.elementMod(a.element, b.element);
        uint256 elemBA = DnaLib.elementMod(b.element, a.element);

        for (rounds = 0; rounds < 15 && hpA > 0 && hpB > 0; rounds++) {
            // A attacks B
            uint256 critRandA = uint256(keccak256(abi.encodePacked(seed, rounds, uint8(0)))) % 100;
            uint256 critMulA  = critRandA < (5 + a.intl / 20) ? 150 : 100;
            uint256 dmgA      = uint256(a.atk) * 100 / (100 + uint256(b.def))
                                    * elemAB / 100 * critMulA / 100;
            if (dmgA == 0) dmgA = 1;
            hpB = hpB > dmgA ? uint32(hpB - dmgA) : 0;

            if (hpB == 0) { rounds++; break; }

            // B attacks A
            uint256 critRandB = uint256(keccak256(abi.encodePacked(seed, rounds, uint8(1)))) % 100;
            uint256 critMulB  = critRandB < (5 + b.intl / 20) ? 150 : 100;
            uint256 dmgB      = uint256(b.atk) * 100 / (100 + uint256(a.def))
                                    * elemBA / 100 * critMulB / 100;
            if (dmgB == 0) dmgB = 1;
            hpA = hpA > dmgB ? uint32(hpA - dmgB) : 0;
        }

        bool firstWins = hpA >= hpB; // tie → first pet wins
        result.firstWins         = firstWins;
        result.rounds            = rounds;
        result.winnerHpRemaining = uint16(
            (firstWins ? hpA : hpB) > type(uint16).max
                ? type(uint16).max
                : (firstWins ? hpA : hpB)
        );
    }
}
