// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ZombieData
 * @dev Centralized data management for zombies
 */
contract ZombieData is Ownable {
    // Events
    event NewZombie(uint256 zombieId, string name, uint256 dna, uint8 rarity);
    event ZombieLevelUp(uint256 zombieId, uint32 newLevel);
    event ZombieNameChanged(uint256 zombieId, string newName);
    event ZombieDnaChanged(uint256 zombieId, uint256 newDna);

    // Structs
    struct Zombie {
        string name;
        uint256 dna;
        uint32 level;
        uint32 readyTime;
        uint16 winCount;
        uint16 lossCount;
        uint8 rarity; // 1-5 (common to legendary)
    }

    // Constants
    uint256 public constant DNA_DIGITS = 16;
    uint256 public constant DNA_MODULUS = 10 ** DNA_DIGITS;
    uint256 public constant BATTLE_COOLDOWN = 5 seconds;

    // State variables
    uint256 private _zombieCount;
    mapping(uint256 => Zombie) public zombies;
    mapping(address => bool) public authorizedCallers;

    // Modifiers
    modifier onlyZombieOwner(uint256 _zombieId) {
        require(
            _zombieId > 0 && _zombieId <= _zombieCount,
            "Zombie doesn't exist"
        );
        _;
    }

    modifier onlyAuthorized() {
        require(
            msg.sender == owner() || authorizedCallers[msg.sender],
            "Not authorized to create zombies"
        );
        _;
    }

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Authorize a caller to create zombies
     */
    function authorizeCaller(address _caller) external onlyOwner {
        authorizedCallers[_caller] = true;
    }

    /**
     * @dev Revoke authorization for a caller
     */
    function revokeCaller(address _caller) external onlyOwner {
        authorizedCallers[_caller] = false;
    }

    /**
     * @dev Create a new zombie
     */
    function createZombie(
        string memory _name,
        uint256 _dna,
        uint8 _rarity
    ) external onlyAuthorized returns (uint256) {
        _zombieCount++;
        uint256 newZombieId = _zombieCount;

        zombies[newZombieId] = Zombie({
            name: _name,
            dna: _dna,
            level: 1,
            readyTime: uint32(block.timestamp + BATTLE_COOLDOWN),
            winCount: 0,
            lossCount: 0,
            rarity: _rarity
        });

        emit NewZombie(newZombieId, _name, _dna, _rarity);
        return newZombieId;
    }

    /**
     * @dev Get zombie details
     */
    function getZombie(
        uint256 _zombieId
    ) external view returns (Zombie memory) {
        return zombies[_zombieId];
    }

    /**
     * @dev Get total zombie count
     */
    function getTotalZombiesCount() external view returns (uint256) {
        return _zombieCount;
    }

    /**
     * @dev Get zombie stats
     */
    function getZombieStats(
        uint256 _zombieId
    )
        external
        view
        onlyZombieOwner(_zombieId)
        returns (uint32, uint16, uint16, uint8)
    {
        Zombie memory zombie = zombies[_zombieId];
        return (zombie.level, zombie.winCount, zombie.lossCount, zombie.rarity);
    }

    /**
     * @dev Check if zombie is ready
     */
    function isZombieReady(
        uint256 _zombieId
    ) external view onlyZombieOwner(_zombieId) returns (bool) {
        return block.timestamp >= zombies[_zombieId].readyTime;
    }

    /**
     * @dev Level up a zombie
     */
    function levelUpZombie(
        uint256 _zombieId
    ) external onlyAuthorized onlyZombieOwner(_zombieId) {
        zombies[_zombieId].level++;
        emit ZombieLevelUp(_zombieId, zombies[_zombieId].level);
    }

    /**
     * @dev Change zombie name
     */
    function changeZombieName(
        uint256 _zombieId,
        string memory _newName
    ) external onlyOwner onlyZombieOwner(_zombieId) {
        zombies[_zombieId].name = _newName;
        emit ZombieNameChanged(_zombieId, _newName);
    }

    /**
     * @dev Change zombie DNA
     */
    function changeZombieDna(
        uint256 _zombieId,
        uint256 _newDna
    ) external onlyOwner onlyZombieOwner(_zombieId) {
        zombies[_zombieId].dna = _newDna;
        emit ZombieDnaChanged(_zombieId, _newDna);
    }

    /**
     * @dev Trigger cooldown for a zombie
     */
    function triggerCooldown(
        uint256 _zombieId
    ) external onlyAuthorized onlyZombieOwner(_zombieId) {
        zombies[_zombieId].readyTime = uint32(
            block.timestamp + BATTLE_COOLDOWN
        );
    }

    /**
     * @dev Update battle stats
     */
    function updateBattleStats(
        uint256 _zombieId,
        bool won
    ) external onlyAuthorized onlyZombieOwner(_zombieId) {
        if (won) {
            zombies[_zombieId].winCount++;
        } else {
            zombies[_zombieId].lossCount++;
        }
    }
}
