// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ZombieHelper.sol";

/**
 * @title ZombieAttack
 * @dev Contract for zombie battle mechanics
 * @author Your Name
 */
contract ZombieAttack is ZombieHelper {
    // Events
    event ZombieBattle(uint256 zombieId1, uint256 zombieId2, bool zombie1Wins);
    
    // State variables
    uint256 private randNonce = 0;
    uint256 public constant ATTACK_VICTORY_PROBABILITY = 70; // 70% chance to win
    
    /**
     * @dev Battle two zombies
     * @param _zombieId1 First zombie ID
     * @param _zombieId2 Second zombie ID
     */
    function battleZombies(uint256 _zombieId1, uint256 _zombieId2) public {
        require(_zombieId1 > 0 && _zombieId1 <= getTotalZombies(), "First zombie doesn't exist");
        require(_zombieId2 > 0 && _zombieId2 <= getTotalZombies(), "Second zombie doesn't exist");
        require(_zombieId1 != _zombieId2, "Can't battle zombie with itself");
        
        Zombie storage zombie1 = zombies[_zombieId1];
        Zombie storage zombie2 = zombies[_zombieId2];
        
        require(block.timestamp >= zombie1.readyTime, "First zombie not ready");
        require(block.timestamp >= zombie2.readyTime, "Second zombie not ready");
        
        uint256 rand = _randMod(100);
        bool zombie1Wins = rand <= ATTACK_VICTORY_PROBABILITY;
        
        if (zombie1Wins) {
            zombie1.winCount++;
            zombie2.lossCount++;
            _levelUp(_zombieId1);
        } else {
            zombie2.winCount++;
            zombie1.lossCount++;
            _levelUp(_zombieId2);
        }
        
        // Set cooldown for both zombies
        _triggerCooldown(_zombieId1);
        _triggerCooldown(_zombieId2);
        
        emit ZombieBattle(_zombieId1, _zombieId2, zombie1Wins);
    }
    
    /**
     * @dev Attack another zombie (single zombie attacks)
     * @param _zombieId Attacking zombie ID
     * @param _targetId Target zombie ID
     */
    function attack(uint256 _zombieId, uint256 _targetId) public {
        require(_zombieId > 0 && _zombieId <= getTotalZombies(), "Attacking zombie doesn't exist");
        require(_targetId > 0 && _targetId <= getTotalZombies(), "Target zombie doesn't exist");
        require(_zombieId != _targetId, "Can't attack self");
        
        Zombie storage myZombie = zombies[_zombieId];
        Zombie storage enemyZombie = zombies[_targetId];
        
        require(block.timestamp >= myZombie.readyTime, "Zombie not ready");
        require(block.timestamp >= enemyZombie.readyTime, "Enemy zombie not ready");
        
        uint256 rand = _randMod(100);
        bool won = rand <= ATTACK_VICTORY_PROBABILITY;
        
        if (won) {
            myZombie.winCount++;
            myZombie.level++;
            enemyZombie.lossCount++;
            // Winner gets a new zombie from the defeated one's DNA
            _createZombie("BattleVictory", enemyZombie.dna, _calculateRarity(enemyZombie.dna));
        } else {
            myZombie.lossCount++;
            enemyZombie.winCount++;
            _triggerCooldown(_zombieId);
        }
        
        emit ZombieBattle(_zombieId, _targetId, won);
    }
    
    /**
     * @dev Generate random number with modulo
     * @param _modulus The modulus value
     * @return Random number
     */
    function _randMod(uint256 _modulus) internal returns (uint256) {
        randNonce++;
        return uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, randNonce))) % _modulus;
    }
    
    /**
     * @dev Get battle statistics for a zombie
     * @param _zombieId The zombie ID
     * @return winCount, lossCount, winRate
     */
    function getBattleStats(uint256 _zombieId) public view returns (uint16, uint16, uint256) {
        Zombie memory zombie = zombies[_zombieId];
        uint256 totalBattles = zombie.winCount + zombie.lossCount;
        uint256 winRate = totalBattles > 0 ? (zombie.winCount * 100) / totalBattles : 0;
        return (zombie.winCount, zombie.lossCount, winRate);
    }
}
