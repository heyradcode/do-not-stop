// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ZombieFeeding.sol";

/**
 * @title ZombieHelper
 * @dev Contract for zombie utility functions and leveling up
 * @author Your Name
 */
contract ZombieHelper is ZombieFeeding {
    // Events
    event ZombieLevelUp(uint256 zombieId, uint32 newLevel);
    event ZombieNameChanged(uint256 zombieId, string newName);
    event ZombieDnaChanged(uint256 zombieId, uint256 newDna);

    // Constants
    uint256 public constant LEVEL_UP_FEE = 0.001 ether;
    uint256 public constant NAME_CHANGE_LEVEL = 2;
    uint256 public constant DNA_CHANGE_LEVEL = 20;

    // Modifiers
    modifier onlyOwnerOf(uint256 _zombieId) {
        require(
            _zombieId > 0 && _zombieId <= getTotalZombies(),
            "Zombie doesn't exist"
        );
        _;
    }

    modifier aboveLevel(uint256 _level, uint256 _zombieId) {
        require(zombies[_zombieId].level >= _level, "Zombie level too low");
        _;
    }

    /**
     * @dev Level up a zombie
     * @param _zombieId The zombie ID to level up
     */
    function levelUp(uint256 _zombieId) public payable onlyOwnerOf(_zombieId) {
        require(msg.value == LEVEL_UP_FEE, "Incorrect fee amount");

        zombies[_zombieId].level++;
        emit ZombieLevelUp(_zombieId, zombies[_zombieId].level);
    }

    /**
     * @dev Change zombie name (requires level 2+)
     * @param _zombieId The zombie ID
     * @param _newName The new name
     */
    function changeName(
        uint256 _zombieId,
        string memory _newName
    ) public onlyOwnerOf(_zombieId) aboveLevel(NAME_CHANGE_LEVEL, _zombieId) {
        zombies[_zombieId].name = _newName;
        emit ZombieNameChanged(_zombieId, _newName);
    }

    /**
     * @dev Change zombie DNA (requires level 20+)
     * @param _zombieId The zombie ID
     * @param _newDna The new DNA
     */
    function changeDna(
        uint256 _zombieId,
        uint256 _newDna
    ) public onlyOwnerOf(_zombieId) aboveLevel(DNA_CHANGE_LEVEL, _zombieId) {
        zombies[_zombieId].dna = _newDna;
        emit ZombieDnaChanged(_zombieId, _newDna);
    }

    /**
     * @dev Get zombie stats
     * @param _zombieId The zombie ID
     * @return level, winCount, lossCount, rarity
     */
    function getZombieStats(
        uint256 _zombieId
    ) public view returns (uint32, uint16, uint16, uint8) {
        Zombie memory zombie = zombies[_zombieId];
        return (zombie.level, zombie.winCount, zombie.lossCount, zombie.rarity);
    }

    /**
     * @dev Withdraw contract balance (owner only)
     */
    function withdraw() public onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    /**
     * @dev Internal function to level up a zombie
     * @param _zombieId The zombie ID to level up
     */
    function _levelUp(uint256 _zombieId) internal {
        zombies[_zombieId].level++;
        emit ZombieLevelUp(_zombieId, zombies[_zombieId].level);
    }
}
