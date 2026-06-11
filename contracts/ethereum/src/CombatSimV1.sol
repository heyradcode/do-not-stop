// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CombatSimV1
 * @dev Stateless pure-function sim. Address stored in GameConfig so a balance
 *      patch is just setCombatSim() — no proxy upgrade required.
 *      Phase-1 placeholder: outcome is seed-driven 70/30. Phase 2 replaces
 *      the body with the full round-based stat simulation (plan §3.3).
 */
contract CombatSimV1 {
    uint256 public constant VICTORY_PROBABILITY = 70;

    function simulate(
        uint256, /* petId1 — used in Phase 2 for stat lookup */
        uint256, /* petId2 */
        uint256 vrfSeed
    ) external pure returns (bool firstWins) {
        return (vrfSeed % 100) < VICTORY_PROBABILITY;
    }
}
