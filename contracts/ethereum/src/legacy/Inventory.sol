// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Inventory
 * @dev On-chain stats and records for pets (token ids align with ERC-721)
 * @custom:deprecated LEGACY v1 stack. Pet storage now lives in PetCoreV1 behind a
 *      UUPS proxy per plan §2.1. Do not extend.
 */
contract Inventory is Ownable {
    event NewPet(uint256 petId, string name, uint256 dna, uint8 rarity);
    event PetLevelUp(uint256 petId, uint32 newLevel);
    event PetNameChanged(uint256 petId, string newName);

    struct Pet {
        string name;
        uint256 dna;
        uint32 level;
        uint32 readyTime;
        uint16 winCount;
        uint16 lossCount;
        uint8 rarity;
    }

    uint256 public constant DNA_DIGITS = 16;
    uint256 public constant DNA_MODULUS = 10 ** DNA_DIGITS;
    uint256 public constant BATTLE_COOLDOWN = 5 seconds;

    uint256 private _petCount;
    mapping(uint256 => Pet) private _pets;
    mapping(address => bool) public authorizedCallers;

    modifier entryExists(uint256 _petId) {
        require(_petId > 0 && _petId <= _petCount, "Pet doesn't exist");
        _;
    }

    modifier onlyAuthorized() {
        require(
            msg.sender == owner() || authorizedCallers[msg.sender],
            "Not authorized"
        );
        _;
    }

    constructor() Ownable(msg.sender) {}

    function authorizeCaller(address _caller) external onlyOwner {
        authorizedCallers[_caller] = true;
    }

    function revokeCaller(address _caller) external onlyOwner {
        authorizedCallers[_caller] = false;
    }

    function createPet(
        string memory _name,
        uint256 _dna,
        uint8 _rarity
    ) external onlyAuthorized returns (uint256) {
        _petCount++;
        uint256 newId = _petCount;

        _pets[newId] = Pet({
            name: _name,
            dna: _dna,
            level: 1,
            readyTime: uint32(block.timestamp + BATTLE_COOLDOWN),
            winCount: 0,
            lossCount: 0,
            rarity: _rarity
        });

        emit NewPet(newId, _name, _dna, _rarity);
        return newId;
    }

    function getPet(uint256 _petId) external view returns (Pet memory) {
        return _pets[_petId];
    }

    function totalPets() external view returns (uint256) {
        return _petCount;
    }

    function getPetStats(
        uint256 _petId
    )
        external
        view
        entryExists(_petId)
        returns (uint32, uint16, uint16, uint8)
    {
        Pet memory p = _pets[_petId];
        return (p.level, p.winCount, p.lossCount, p.rarity);
    }

    function isReady(
        uint256 _petId
    ) external view entryExists(_petId) returns (bool) {
        return block.timestamp >= _pets[_petId].readyTime;
    }

    function levelUp(
        uint256 _petId
    ) external onlyAuthorized entryExists(_petId) {
        _pets[_petId].level++;
        emit PetLevelUp(_petId, _pets[_petId].level);
    }

    function changeName(
        uint256 _petId,
        string memory _newName
    ) external onlyOwner entryExists(_petId) {
        _pets[_petId].name = _newName;
        emit PetNameChanged(_petId, _newName);
    }

    function triggerCooldown(
        uint256 _petId
    ) external onlyAuthorized entryExists(_petId) {
        _pets[_petId].readyTime = uint32(block.timestamp + BATTLE_COOLDOWN);
    }

    function updateBattleStats(
        uint256 _petId,
        bool won
    ) external onlyAuthorized entryExists(_petId) {
        if (won) {
            _pets[_petId].winCount++;
        } else {
            _pets[_petId].lossCount++;
        }
    }
}
