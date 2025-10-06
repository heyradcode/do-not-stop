// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../data/ZombieData.sol";
import "../utils/ZombieUtils.sol";

/**
 * @title ZombieBreeding
 * @dev Pure breeding logic for zombies
 */
contract ZombieBreeding {
    // Events
    event ZombieBred(uint256 zombieId1, uint256 zombieId2, uint256 newZombieId);

    // Dependencies
    ZombieData public zombieData;
    ZombieUtils public zombieUtils;

    constructor(address _zombieData, address _zombieUtils) {
        zombieData = ZombieData(_zombieData);
        zombieUtils = ZombieUtils(_zombieUtils);
    }

    /**
     * @dev Create a zombie from two existing zombies (breeding)
     */
    function createZombieFromDNA(
        uint256 _zombieId1,
        uint256 _zombieId2,
        string memory _name
    ) external {
        require(
            _zombieId1 > 0 && _zombieId1 <= zombieData.getTotalZombiesCount(),
            "First zombie doesn't exist"
        );
        require(
            _zombieId2 > 0 && _zombieId2 <= zombieData.getTotalZombiesCount(),
            "Second zombie doesn't exist"
        );
        require(_zombieId1 != _zombieId2, "Can't breed zombie with itself");

        require(zombieData.isZombieReady(_zombieId1), "First zombie not ready");
        require(
            zombieData.isZombieReady(_zombieId2),
            "Second zombie not ready"
        );

        // Get parent DNA
        ZombieData.Zombie memory zombie1 = zombieData.getZombie(_zombieId1);
        ZombieData.Zombie memory zombie2 = zombieData.getZombie(_zombieId2);

        uint256 newDna = mixDna(zombie1.dna, zombie2.dna);
        uint8 rarity = zombieUtils.calculateRarity(newDna);

        uint256 newZombieId = zombieData.createZombie(_name, newDna, rarity);

        // Set cooldown for parent zombies
        zombieData.triggerCooldown(_zombieId1);
        zombieData.triggerCooldown(_zombieId2);

        emit ZombieBred(_zombieId1, _zombieId2, newZombieId);
    }

    /**
     * @dev Mix DNA from two zombies
     */
    function mixDna(
        uint256 _dna1,
        uint256 _dna2
    ) public view returns (uint256) {
        uint256 rand = uint256(
            keccak256(abi.encodePacked(block.timestamp, _dna1, _dna2))
        );
        return rand % (10 ** 16); // DNA_MODULUS
    }
}
