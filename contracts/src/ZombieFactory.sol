// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ZombieFactory
 * @dev Modern CryptoZombies contract with ERC-721 NFT standard
 * @author Your Name
 */
contract ZombieFactory is ERC721, Ownable, ReentrancyGuard {
    uint256 private _zombieIds;
    
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
    
    // Mapping from token ID to zombie
    mapping(uint256 => Zombie) public zombies;
    
    // Mapping from owner to zombie count
    mapping(address => uint256) public ownerZombieCount;
    
    // Events
    event NewZombie(uint256 zombieId, string name, uint256 dna, uint8 rarity);
    event ZombieLevelUp(uint256 zombieId, uint32 newLevel);
    event ZombieBattle(uint256 zombieId, bool won, uint32 newLevel);
    
    // Constants
    uint256 private constant DNA_DIGITS = 16;
    uint256 private constant LEVEL_UP_REQUIREMENT = 1000;
    uint256 private constant BATTLE_COOLDOWN = 1 minutes;
    
    constructor() ERC721("CryptoZombies", "ZOMBIE") Ownable(msg.sender) {}
    
    /**
     * @dev Create a new zombie with random DNA
     * @param _name The name of the zombie
     */
    function createRandomZombie(string memory _name) public {
        require(ownerZombieCount[msg.sender] == 0, "You already have a zombie!");
        
        _zombieIds++;
        uint256 newZombieId = _zombieIds;
        
        uint256 randDna = _generateRandomDna(_name);
        uint8 rarity = _calculateRarity(randDna);
        
        zombies[newZombieId] = Zombie({
            name: _name,
            dna: randDna,
            level: 1,
            readyTime: uint32(block.timestamp + BATTLE_COOLDOWN),
            winCount: 0,
            lossCount: 0,
            rarity: rarity
        });
        
        ownerZombieCount[msg.sender]++;
        _safeMint(msg.sender, newZombieId);
        
        emit NewZombie(newZombieId, _name, randDna, rarity);
    }
    
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
        require(ownerOf(_zombieId1) == msg.sender, "You don't own the first zombie");
        require(ownerOf(_zombieId2) == msg.sender, "You don't own the second zombie");
        require(_zombieId1 != _zombieId2, "Can't breed zombie with itself");
        
        Zombie storage zombie1 = zombies[_zombieId1];
        Zombie storage zombie2 = zombies[_zombieId2];
        
        require(block.timestamp >= zombie1.readyTime, "First zombie not ready");
        require(block.timestamp >= zombie2.readyTime, "Second zombie not ready");
        
        uint256 newDna = _mixDna(zombie1.dna, zombie2.dna);
        uint8 rarity = _calculateRarity(newDna);
        
        _zombieIds++;
        uint256 newZombieId = _zombieIds;
        
        zombies[newZombieId] = Zombie({
            name: _name,
            dna: newDna,
            level: 1,
            readyTime: uint32(block.timestamp + BATTLE_COOLDOWN),
            winCount: 0,
            lossCount: 0,
            rarity: rarity
        });
        
        ownerZombieCount[msg.sender]++;
        _safeMint(msg.sender, newZombieId);
        
        // Set cooldown for parent zombies
        zombie1.readyTime = uint32(block.timestamp + BATTLE_COOLDOWN);
        zombie2.readyTime = uint32(block.timestamp + BATTLE_COOLDOWN);
        
        emit NewZombie(newZombieId, _name, newDna, rarity);
    }
    
    /**
     * @dev Battle two zombies
     * @param _zombieId1 First zombie ID
     * @param _zombieId2 Second zombie ID
     */
    function battleZombies(uint256 _zombieId1, uint256 _zombieId2) public {
        require(ownerOf(_zombieId1) == msg.sender, "You don't own the first zombie");
        require(ownerOf(_zombieId2) == msg.sender, "You don't own the second zombie");
        require(_zombieId1 != _zombieId2, "Can't battle zombie with itself");
        
        Zombie storage zombie1 = zombies[_zombieId1];
        Zombie storage zombie2 = zombies[_zombieId2];
        
        require(block.timestamp >= zombie1.readyTime, "First zombie not ready");
        require(block.timestamp >= zombie2.readyTime, "Second zombie not ready");
        
        uint256 rand = uint256(keccak256(abi.encodePacked(block.timestamp, block.difficulty, _zombieId1, _zombieId2)));
        bool zombie1Wins = (rand % 2) == 0;
        
        if (zombie1Wins) {
            zombie1.winCount++;
            zombie2.lossCount++;
            _levelUp(_zombieId1);
            emit ZombieBattle(_zombieId1, true, zombie1.level);
            emit ZombieBattle(_zombieId2, false, zombie2.level);
        } else {
            zombie2.winCount++;
            zombie1.lossCount++;
            _levelUp(_zombieId2);
            emit ZombieBattle(_zombieId2, true, zombie2.level);
            emit ZombieBattle(_zombieId1, false, zombie1.level);
        }
        
        // Set cooldown
        zombie1.readyTime = uint32(block.timestamp + BATTLE_COOLDOWN);
        zombie2.readyTime = uint32(block.timestamp + BATTLE_COOLDOWN);
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
     * @dev Get all zombies owned by an address
     * @param _owner The owner address
     * @return Array of zombie IDs
     */
    function getZombiesByOwner(address _owner) public view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](ownerZombieCount[_owner]);
        uint256 counter = 0;
        
        for (uint256 i = 1; i <= _zombieIds; i++) {
            if (ownerOf(i) == _owner) {
                result[counter] = i;
                counter++;
            }
        }
        
        return result;
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
    function _generateRandomDna(string memory _name) private view returns (uint256) {
        uint256 rand = uint256(keccak256(abi.encodePacked(_name, block.timestamp, block.difficulty)));
        return rand % (10 ** DNA_DIGITS);
    }
    
    /**
     * @dev Mix DNA from two zombies
     * @param _dna1 First zombie DNA
     * @param _dna2 Second zombie DNA
     * @return Mixed DNA
     */
    function _mixDna(uint256 _dna1, uint256 _dna2) private view returns (uint256) {
        uint256 rand = uint256(keccak256(abi.encodePacked(block.timestamp, _dna1, _dna2)));
        return (rand % (10 ** DNA_DIGITS));
    }
    
    /**
     * @dev Calculate rarity based on DNA
     * @param _dna The DNA to calculate rarity for
     * @return Rarity level (1-5)
     */
    function _calculateRarity(uint256 _dna) private pure returns (uint8) {
        uint256 rarityScore = _dna % 100;
        if (rarityScore < 50) return 1; // Common
        if (rarityScore < 75) return 2; // Uncommon
        if (rarityScore < 90) return 3; // Rare
        if (rarityScore < 98) return 4; // Epic
        return 5; // Legendary
    }
    
    /**
     * @dev Level up a zombie
     * @param _zombieId The zombie ID to level up
     */
    function _levelUp(uint256 _zombieId) private {
        zombies[_zombieId].level++;
        emit ZombieLevelUp(_zombieId, zombies[_zombieId].level);
    }
    
    /**
     * @dev Override tokenURI to return metadata
     * @param tokenId The token ID
     * @return Token URI
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        
        Zombie memory zombie = zombies[tokenId];
        
        return string(abi.encodePacked(
            "https://api.cryptozombies.io/metadata/",
            _toString(tokenId),
            "?dna=",
            _toString(zombie.dna),
            "&rarity=",
            _toString(zombie.rarity)
        ));
    }
    
    /**
     * @dev Convert uint256 to string
     * @param value The value to convert
     * @return String representation
     */
    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
