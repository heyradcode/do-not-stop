// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./data/ZombieData.sol";
import "./features/ZombieBattle.sol";
import "./features/ZombieBreeding.sol";
import "./utils/ZombieUtils.sol";

/**
 * @title CryptoZombies
 * @dev Main contract using composition instead of deep inheritance
 * @author Your Name
 */
contract CryptoZombies is ERC721, ReentrancyGuard, Ownable {
    // Events
    event ZombieTransferred(uint256 zombieId, address from, address to);

    // Dependencies
    ZombieData public zombieData;
    ZombieBattle public zombieBattle;
    ZombieBreeding public zombieBreeding;
    ZombieUtils public zombieUtils;

    // State variables
    mapping(address => uint256) public ownerZombieCount;
    uint256 public constant LEVEL_UP_FEE = 0.001 ether;
    uint256 public constant NAME_CHANGE_LEVEL = 2;
    uint256 public constant DNA_CHANGE_LEVEL = 20;

    constructor() ERC721("CryptoZombies", "ZOMBIE") Ownable(msg.sender) {
        // Deploy dependencies
        zombieData = ZombieData(address(new ZombieData()));
        zombieUtils = ZombieUtils(address(new ZombieUtils()));
        zombieBattle = ZombieBattle(
            address(new ZombieBattle(address(zombieData), address(zombieUtils)))
        );
        zombieBreeding = ZombieBreeding(
            address(
                new ZombieBreeding(address(zombieData), address(zombieUtils))
            )
        );
    }

    // Modifiers
    modifier onlyZombieOwner(uint256 _zombieId) {
        require(
            ownerOf(_zombieId) == msg.sender,
            "Not the owner of this zombie"
        );
        _;
    }

    modifier aboveLevel(uint256 _level, uint256 _zombieId) {
        (uint32 level, , , ) = zombieData.getZombieStats(_zombieId);
        require(level >= _level, "Zombie level too low");
        _;
    }

    // ERC721 Overrides
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        // If minting
        if (from == address(0)) {
            return super._update(to, tokenId, auth);
        }

        // If transferring
        if (to != address(0)) {
            ownerZombieCount[from]--;
            ownerZombieCount[to]++;
            emit ZombieTransferred(tokenId, from, to);
        }

        return super._update(to, tokenId, auth);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return
            string(
                abi.encodePacked(
                    "https://api.cryptozombies.io/metadata/",
                    _toString(tokenId)
                )
            );
    }

    // Zombie Creation
    function createRandomZombie(string memory _name) public {
        require(
            ownerZombieCount[msg.sender] == 0,
            "You already have a zombie!"
        );

        uint256 randDna = zombieUtils.generateRandomDna(_name);
        uint8 rarity = zombieUtils.calculateRarity(randDna);

        uint256 newZombieId = zombieData.createZombie(_name, randDna, rarity);
        _safeMint(msg.sender, newZombieId);
        ownerZombieCount[msg.sender]++;
    }

    // Battle Functions
    function battleZombies(uint256 _zombieId1, uint256 _zombieId2) public {
        zombieBattle.battleZombies(_zombieId1, _zombieId2);
    }

    function attack(uint256 _zombieId, uint256 _targetId) public {
        zombieBattle.attack(_zombieId, _targetId);
    }

    // Breeding Functions
    function createZombieFromDNA(
        uint256 _zombieId1,
        uint256 _zombieId2,
        string memory _name
    ) public {
        zombieBreeding.createZombieFromDNA(_zombieId1, _zombieId2, _name);
    }

    // Utility Functions
    function levelUp(
        uint256 _zombieId
    ) public payable onlyZombieOwner(_zombieId) {
        require(msg.value == LEVEL_UP_FEE, "Incorrect fee amount");
        zombieData.levelUpZombie(_zombieId);
    }

    function changeName(
        uint256 _zombieId,
        string memory _newName
    )
        public
        onlyZombieOwner(_zombieId)
        aboveLevel(NAME_CHANGE_LEVEL, _zombieId)
    {
        zombieData.changeZombieName(_zombieId, _newName);
    }

    function changeDna(
        uint256 _zombieId,
        uint256 _newDna
    )
        public
        onlyZombieOwner(_zombieId)
        aboveLevel(DNA_CHANGE_LEVEL, _zombieId)
    {
        zombieData.changeZombieDna(_zombieId, _newDna);
    }

    // View Functions
    function getZombie(
        uint256 _zombieId
    ) public view returns (ZombieData.Zombie memory) {
        return zombieData.getZombie(_zombieId);
    }

    function getTotalZombiesCount() public view returns (uint256) {
        return zombieData.getTotalZombiesCount();
    }

    function getZombieStats(
        uint256 _zombieId
    ) public view returns (uint32, uint16, uint16, uint8) {
        return zombieData.getZombieStats(_zombieId);
    }

    function getBattleStats(
        uint256 _zombieId
    ) public view returns (uint16, uint16, uint256) {
        return zombieBattle.getBattleStats(_zombieId);
    }

    function getZombiesByOwner(
        address owner
    ) public view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](balanceOf(owner));
        uint256 counter = 0;

        for (uint256 i = 1; i <= getTotalZombiesCount(); i++) {
            if (_ownerOf(i) == owner) {
                result[counter] = i;
                counter++;
            }
        }

        return result;
    }

    // Admin Functions
    function withdraw() public onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    // Utility Functions
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
