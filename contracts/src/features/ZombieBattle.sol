// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../data/ZombieData.sol";
import "../utils/ZombieUtils.sol";

/**
 * @title ZombieBattle
 * @dev Pure battle logic for zombies
 */
contract ZombieBattle {
    // Events
    event BattleResult(uint256 zombieId1, uint256 zombieId2, bool zombie1Wins);

    // Constants
    uint256 public constant ATTACK_VICTORY_PROBABILITY = 70; // 70% chance to win

    // Dependencies
    ZombieData public zombieData;
    ZombieUtils public zombieUtils;

    constructor(address _zombieData, address _zombieUtils) {
        zombieData = ZombieData(_zombieData);
        zombieUtils = ZombieUtils(_zombieUtils);
    }

    /**
     * @dev Battle two zombies
     */
    function battleZombies(uint256 _zombieId1, uint256 _zombieId2) external {
        require(
            _zombieId1 > 0 && _zombieId1 <= zombieData.getTotalZombiesCount(),
            "First zombie doesn't exist"
        );
        require(
            _zombieId2 > 0 && _zombieId2 <= zombieData.getTotalZombiesCount(),
            "Second zombie doesn't exist"
        );
        require(_zombieId1 != _zombieId2, "Can't battle zombie with itself");

        require(zombieData.isZombieReady(_zombieId1), "First zombie not ready");
        require(
            zombieData.isZombieReady(_zombieId2),
            "Second zombie not ready"
        );

        uint256 rand = zombieUtils.randMod(100);
        bool zombie1Wins = rand <= ATTACK_VICTORY_PROBABILITY;

        if (zombie1Wins) {
            zombieData.updateBattleStats(_zombieId1, true);
            zombieData.updateBattleStats(_zombieId2, false);
            zombieData.levelUpZombie(_zombieId1);
        } else {
            zombieData.updateBattleStats(_zombieId2, true);
            zombieData.updateBattleStats(_zombieId1, false);
            zombieData.levelUpZombie(_zombieId2);
        }

        // Set cooldown for both zombies
        zombieData.triggerCooldown(_zombieId1);
        zombieData.triggerCooldown(_zombieId2);

        emit BattleResult(_zombieId1, _zombieId2, zombie1Wins);
    }

    /**
     * @dev Attack another zombie (single zombie attacks)
     */
    function attack(uint256 _zombieId, uint256 _targetId) external {
        require(
            _zombieId > 0 && _zombieId <= zombieData.getTotalZombiesCount(),
            "Attacking zombie doesn't exist"
        );
        require(
            _targetId > 0 && _targetId <= zombieData.getTotalZombiesCount(),
            "Target zombie doesn't exist"
        );
        require(_zombieId != _targetId, "Can't attack self");

        require(zombieData.isZombieReady(_zombieId), "Zombie not ready");
        require(zombieData.isZombieReady(_targetId), "Enemy zombie not ready");

        uint256 rand = zombieUtils.randMod(100);
        bool won = rand <= ATTACK_VICTORY_PROBABILITY;

        if (won) {
            zombieData.updateBattleStats(_zombieId, true);
            zombieData.updateBattleStats(_targetId, false);
            zombieData.levelUpZombie(_zombieId);
        } else {
            zombieData.updateBattleStats(_zombieId, false);
            zombieData.updateBattleStats(_targetId, true);
            zombieData.triggerCooldown(_zombieId);
        }

        emit BattleResult(_zombieId, _targetId, won);
    }

    /**
     * @dev Get battle statistics for a zombie
     */
    function getBattleStats(
        uint256 _zombieId
    ) external view returns (uint16, uint16, uint256) {
        (, uint16 winCount, uint16 lossCount, ) = zombieData.getZombieStats(
            _zombieId
        );
        uint256 totalBattles = winCount + lossCount;
        uint256 winRate = totalBattles > 0
            ? (winCount * 100) / totalBattles
            : 0;
        return (winCount, lossCount, winRate);
    }
}
