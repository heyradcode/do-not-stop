// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ZombieFactory.sol";

/**
 * @title ZombieFeeding
 * @dev Contract for zombie breeding and DNA mixing functionality
 * @author Your Name
 */
contract ZombieFeeding is ZombieFactory {
    // Events
    event ZombieBred(uint256 zombieId1, uint256 zombieId2, uint256 newZombieId);

    /**
     * @dev Create a zombie from two existing zombies (breeding)
     * @param _zombieId1 First parent zombie ID
     * @param _zombieId2 Second parent zombie ID
     * @param _name Name for the new zombie
     */
    function createZombieFromDNA(
        uint256 _zombieId1,
        uint256 _zombieId2,
        string memory _name
    ) public {
        require(
            _zombieId1 > 0 && _zombieId1 <= getTotalZombiesCount(),
            "First zombie doesn't exist"
        );
        require(
            _zombieId2 > 0 && _zombieId2 <= getTotalZombiesCount(),
            "Second zombie doesn't exist"
        );
        require(_zombieId1 != _zombieId2, "Can't breed zombie with itself");

        Zombie storage zombie1 = zombies[_zombieId1];
        Zombie storage zombie2 = zombies[_zombieId2];

        require(block.timestamp >= zombie1.readyTime, "First zombie not ready");
        require(
            block.timestamp >= zombie2.readyTime,
            "Second zombie not ready"
        );

        uint256 newDna = _mixDna(zombie1.dna, zombie2.dna);
        uint8 rarity = _calculateRarity(newDna);

        uint256 newZombieId = _createZombie(_name, newDna, rarity);

        // Set cooldown for parent zombies
        zombie1.readyTime = uint32(block.timestamp + BATTLE_COOLDOWN);
        zombie2.readyTime = uint32(block.timestamp + BATTLE_COOLDOWN);

        emit ZombieBred(_zombieId1, _zombieId2, newZombieId);
    }

    /**
     * @dev Mix DNA from two zombies
     * @param _dna1 First zombie DNA
     * @param _dna2 Second zombie DNA
     * @return Mixed DNA
     */
    function _mixDna(
        uint256 _dna1,
        uint256 _dna2
    ) internal view returns (uint256) {
        uint256 rand = uint256(
            keccak256(abi.encodePacked(block.timestamp, _dna1, _dna2))
        );
        return rand % DNA_MODULUS;
    }

    /**
     * @dev Check if a zombie is ready for action
     * @param _zombieId The zombie ID to check
     * @return True if zombie is ready
     */
    function isZombieReady(uint256 _zombieId) public view returns (bool) {
        return block.timestamp >= zombies[_zombieId].readyTime;
    }

    /**
     * @dev Set cooldown for a zombie
     * @param _zombieId The zombie ID
     */
    function _triggerCooldown(uint256 _zombieId) internal {
        zombies[_zombieId].readyTime = uint32(
            block.timestamp + BATTLE_COOLDOWN
        );
    }
}
