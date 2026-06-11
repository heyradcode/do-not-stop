// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./GameConfig.sol";

/**
 * @title PetCoreV1
 * @dev UUPS-upgradeable ERC-721 that owns all pet data (DNA, stats, lineage, cooldowns).
 *      Exposes mutator methods callable only by the authorized GameLogicV1 proxy (or owner).
 *      Storage layout must be append-only from this point forward.
 */
contract PetCoreV1 is ERC721PausableUpgradeable, UUPSUpgradeable, OwnableUpgradeable {
    event NewPet(uint256 indexed petId, string name, uint256 dna, uint8 rarity);
    event PetLevelUp(uint256 indexed petId, uint32 newLevel);
    event PetNameChanged(uint256 indexed petId, string newName);
    event PetTransferred(uint256 indexed tokenId, address from, address to);

    struct Pet {
        string name;
        uint256 dna;
        uint32 level;
        uint32 readyTime;
        uint16 winCount;
        uint16 lossCount;
        uint8 rarity;
    }

    uint256 public constant DNA_DIGITS  = 16;
    uint256 public constant DNA_MODULUS = 10 ** DNA_DIGITS;
    uint256 public constant NAME_CHANGE_LEVEL = 2;

    uint256 private _petCount;
    mapping(uint256 => Pet) private _pets;
    mapping(address => bool) public authorizedCallers;
    GameConfig public gameConfig;

    // Reserve 45 slots: 5 declared above + 45 gap = 50 total for PetCoreV1's own scope.
    uint256[45] private __gap;

    // ─── modifiers ────────────────────────────────────────────────────────────

    modifier onlyAuthorized() {
        require(msg.sender == owner() || authorizedCallers[msg.sender], "Not authorized");
        _;
    }

    modifier entryExists(uint256 petId) {
        require(petId > 0 && petId <= _petCount, "Pet doesn't exist");
        _;
    }

    modifier onlyPetOwner(uint256 tokenId) {
        require(ownerOf(tokenId) == msg.sender, "Not the owner of this pet");
        _;
    }

    modifier aboveLevel(uint256 level_, uint256 tokenId) {
        require(_pets[tokenId].level >= level_, "Pet level too low");
        _;
    }

    // ─── initializer ──────────────────────────────────────────────────────────

    function initialize(address gameConfig_, address initialOwner) public initializer {
        __ERC721_init("CryptoPets", "PETS");
        __ERC721Pausable_init();
        __UUPSUpgradeable_init();
        __Ownable_init();
        __Pausable_init();
        _transferOwnership(initialOwner);
        gameConfig = GameConfig(gameConfig_);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ─── caller authorization ─────────────────────────────────────────────────

    function authorizeCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = true;
    }

    function revokeCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = false;
    }

    // ─── authorized mutators (called by GameLogicV1) ─────────────────────────

    function createPet(
        string memory name_,
        uint256 dna,
        uint8 rarity
    ) external onlyAuthorized returns (uint256) {
        return _createPet(name_, dna, rarity);
    }

    function mintTo(address to, uint256 tokenId) external onlyAuthorized {
        _mint(to, tokenId);
    }

    function triggerCooldown(uint256 petId) external onlyAuthorized entryExists(petId) {
        _pets[petId].readyTime = uint32(block.timestamp + gameConfig.battleCooldown());
    }

    function updateBattleStats(uint256 petId, bool won) external onlyAuthorized entryExists(petId) {
        if (won) { _pets[petId].winCount++; } else { _pets[petId].lossCount++; }
    }

    function levelUpInternal(uint256 petId) external onlyAuthorized entryExists(petId) {
        _pets[petId].level++;
        emit PetLevelUp(petId, _pets[petId].level);
    }

    // ─── user-facing functions ────────────────────────────────────────────────

    function createRandom(string memory name_) external whenNotPaused {
        _requireValidName(name_);
        require(balanceOf(msg.sender) == 0, "You already have a pet!");

        uint256 randDna = uint256(
            keccak256(abi.encodePacked(name_, block.timestamp, block.prevrandao))
        ) % DNA_MODULUS;
        // Phase-0 clamp: starter rarity forced to 1 until gacha mint (Phase 3).
        uint256 newId = _createPet(name_, randDna, 1);
        _mint(msg.sender, newId);
    }

    function levelUp(uint256 tokenId) external payable whenNotPaused onlyPetOwner(tokenId) {
        require(msg.value == gameConfig.levelUpFee(), "Incorrect fee amount");
        _pets[tokenId].level++;
        emit PetLevelUp(tokenId, _pets[tokenId].level);
    }

    function changeName(
        uint256 tokenId,
        string memory newName_
    )
        external
        whenNotPaused
        onlyPetOwner(tokenId)
        aboveLevel(NAME_CHANGE_LEVEL, tokenId)
    {
        _requireValidName(newName_);
        _pets[tokenId].name = newName_;
        emit PetNameChanged(tokenId, newName_);
    }

    function withdraw() external onlyOwner {
        (bool ok, ) = payable(owner()).call{value: address(this).balance}("");
        require(ok, "Withdraw failed");
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─── views ────────────────────────────────────────────────────────────────

    function getPet(uint256 petId) external view returns (Pet memory) {
        return _pets[petId];
    }

    function totalPets() external view returns (uint256) { return _petCount; }

    function isReady(uint256 petId) external view entryExists(petId) returns (bool) {
        return block.timestamp >= _pets[petId].readyTime;
    }

    function getPetStats(
        uint256 petId
    ) external view entryExists(petId) returns (uint32, uint16, uint16, uint8) {
        Pet memory p = _pets[petId];
        return (p.level, p.winCount, p.lossCount, p.rarity);
    }

    function getByOwner(address owner_) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](balanceOf(owner_));
        uint256 counter;
        for (uint256 i = 1; i <= _petCount; i++) {
            if (_exists(i) && ownerOf(i) == owner_) { result[counter++] = i; }
        }
        return result;
    }

    // ─── ERC-721 overrides ────────────────────────────────────────────────────

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Token does not exist");
        return string(
            abi.encodePacked("https://api.cryptopets.io/metadata/", _toString(tokenId))
        );
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override {
        super._beforeTokenTransfer(from, to, tokenId); // pause check via ERC721PausableUpgradeable
        if (from != address(0) && to != address(0)) {
            emit PetTransferred(tokenId, from, to);
        }
    }

    // ─── internal helpers ─────────────────────────────────────────────────────

    function _createPet(
        string memory name_,
        uint256 dna,
        uint8 rarity
    ) private returns (uint256) {
        _petCount++;
        uint256 newId = _petCount;
        _pets[newId] = Pet({
            name:      name_,
            dna:       dna,
            level:     1,
            readyTime: uint32(block.timestamp + gameConfig.battleCooldown()),
            winCount:  0,
            lossCount: 0,
            rarity:    rarity
        });
        emit NewPet(newId, name_, dna, rarity);
        return newId;
    }

    function _requireValidName(string memory name_) private view {
        uint256 len = bytes(name_).length;
        require(len > 0 && len <= gameConfig.maxNameLength(), "Invalid name length");
    }

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value; uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buf = new bytes(digits);
        while (value != 0) { digits -= 1; buf[digits] = bytes1(uint8(48 + uint256(value % 10))); value /= 10; }
        return string(buf);
    }
}
