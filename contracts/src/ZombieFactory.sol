// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ZombieFactory
 * @dev Base contract for zombie creation and core data structures
 * @author Your Name
 */
contract ZombieFactory is Ownable {
    // Events
    event NewZombie(uint256 zombieId, string name, uint256 dna, uint8 rarity);
    
    // Constants
    uint256 public constant DNA_DIGITS = 16;
    uint256 public constant DNA_MODULUS = 10 ** DNA_DIGITS;
    uint256 public constant BATTLE_COOLDOWN = 1 minutes;
    
    // Zombie struct with modern traits
    struct Zombie {
        string name;
        uint256 dna;
        uint32 level;
        uint32 readyTime;
        uint16 winCount;
        uint16 lossCount;
        uint8 rarity; // 1-5 (common to legendary)
    }
    
    // State variables
    uint256 private _zombieIds;
    
    // Mapping from token ID to zombie
    mapping(uint256 => Zombie) public zombies;
    
    // Mapping from owner to zombie count
    mapping(address => uint256) public ownerZombieCount;
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @dev Create a new zombie with random DNA
     * @param _name The name of the zombie
     */
    function createRandomZombie(string memory _name) public {
        require(ownerZombieCount[msg.sender] == 0, "You already have a zombie!");
        
        uint256 randDna = _generateRandomDna(_name);
        uint8 rarity = _calculateRarity(randDna);
        
        _createZombie(_name, randDna, rarity);
    }
    
    /**
     * @dev Get zombie details
     * @param _zombieId The zombie ID
     * @return Zombie struct
     */
    function getZombie(uint256 _zombieId) public view returns (Zombie memory) {
        return zombies[_zombieId];
    }
    
    /**
     * @dev Get total zombie count
     * @return Total number of zombies created
     */
    function getTotalZombies() public view returns (uint256) {
        return _zombieIds;
    }
    
    /**
     * @dev Generate random DNA based on name and block data
     * @param _name The name to use for randomness
     * @return Random DNA
     */
    function _generateRandomDna(string memory _name) internal view returns (uint256) {
        uint256 rand = uint256(keccak256(abi.encodePacked(_name, block.timestamp, block.prevrandao)));
        return rand % DNA_MODULUS;
    }
    
    /**
     * @dev Calculate rarity based on DNA
     * @param _dna The DNA to calculate rarity for
     * @return Rarity level (1-5)
     */
    function _calculateRarity(uint256 _dna) internal pure returns (uint8) {
        uint256 rarityScore = _dna % 100;
        if (rarityScore < 50) return 1; // Common
        if (rarityScore < 75) return 2; // Uncommon
        if (rarityScore < 90) return 3; // Rare
        if (rarityScore < 98) return 4; // Epic
        return 5; // Legendary
    }
    
    /**
     * @dev Internal function to create zombie (used by other contracts)
     * @param _name The name of the zombie
     * @param _dna The DNA of the zombie
     * @param _rarity The rarity of the zombie
     * @return The new zombie ID
     */
    function _createZombie(string memory _name, uint256 _dna, uint8 _rarity) internal virtual returns (uint256) {
        _zombieIds++;
        uint256 newZombieId = _zombieIds;
        
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
}